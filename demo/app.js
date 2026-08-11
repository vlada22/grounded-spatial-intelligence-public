import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const RESOURCE_TIMEOUT_MS = 15000;

const ui = {
  viewport: $("#viewport"),
  status: $("#viewport-status"),
  condition: $("#condition-select"),
  sceneToggle: $("#toggle-scene"),
  evidenceToggle: $("#toggle-evidence"),
  camerasToggle: $("#toggle-cameras"),
  groundTruthToggle: $("#toggle-ground-truth"),
  resetView: $("#reset-view"),
  legend: $(".viewport-legend"),
  frame: $("#source-frame"),
  overlay: $("#mask-overlay"),
  frameSlider: $("#frame-slider"),
  frameTitle: $("#frame-title"),
  frameTime: $("#frame-time"),
  frameBadge: $("#frame-index-badge"),
  maskStatus: $("#mask-status"),
  objectTitle: $("#object-title"),
  objectSwatch: $("#object-swatch"),
  objectTabs: $("#object-tabs"),
  objectDimensions: $("#object-dimensions"),
  objectCentroidError: $("#object-centroid-error"),
  objectPoints: $("#object-points"),
  objectGeometryConfidence: $("#object-geometry-confidence"),
  objectSemanticScore: $("#object-semantic-score"),
  objectViews: $("#object-views"),
  supportFrames: $("#support-frames"),
  spatialQuestion: $("#spatial-question"),
  spatialAnswer: $("#spatial-answer"),
  distanceComparison: $("#distance-comparison"),
  centroidMetric: $("#metric-centroid"),
  dimensionMetric: $("#metric-dimension"),
  pairwiseMetric: $("#metric-pairwise"),
  nearestMetric: $("#metric-nearest"),
};

const state = {
  data: null,
  conditionId: "da3-sam3-unfiltered",
  objectId: "red-box",
  frameIndex: 0,
  maskMode: "sam3",
  scene: null,
  camera: null,
  renderer: null,
  renderingAvailable: false,
  controls: null,
  world: null,
  sceneCloud: null,
  evidenceGroup: null,
  predictionGroup: null,
  groundTruthGroup: null,
  cameraGroup: null,
  cameraMarker: null,
  hitMeshes: [],
  evidenceClouds: new Map(),
  predictedBoxes: new Map(),
  conditionLoadVersion: 0,
};

const plyLoader = new PLYLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

boot().catch((error) => {
  window.clearTimeout(window.__gsiBootWatchdog);
  console.error(error);
  showStatus(`The reconstruction viewer could not start: ${error.message}`, "error");
});

async function boot() {
  state.data = await fetchJson("./data/scene.json");
  populateControls();
  state.renderingAvailable = initializeScene();
  bindEvents();

  updateMetrics(currentCondition().summary);
  selectObject(state.objectId);
  setFrame(0);
  window.clearTimeout(window.__gsiBootWatchdog);

  if (!state.renderingAvailable) {
    showRenderingFallback();
    return;
  }

  buildGroundTruth();
  buildCameras();
  buildConditionGeometry(state.conditionId);
  animate();
  showStatus("Loading 3D resources…");

  const initialResults = await Promise.allSettled([
    loadSceneCloud(),
    loadConditionClouds(state.conditionId, state.conditionLoadVersion),
  ]);
  finishResourceLoad(initialResults);
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function populateControls() {
  for (const condition of state.data.conditions) {
    const option = document.createElement("option");
    option.value = condition.id;
    option.textContent = condition.label;
    option.selected = condition.id === state.conditionId;
    ui.condition.append(option);
  }

  for (const object of state.data.objects) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.objectId = object.id;
    button.style.setProperty("--object-colour", object.colour);
    button.textContent = object.label.replace(" Box", "");
    button.addEventListener("click", () => selectObject(object.id));
    ui.objectTabs.append(button);

    const legend = document.createElement("span");
    legend.innerHTML = `<i style="background:${object.colour}"></i>${object.label}`;
    ui.legend.append(legend);
  }
}

function initializeScene() {
  state.scene = new THREE.Scene();
  state.camera = new THREE.PerspectiveCamera(48, 1, 0.01, 100);
  try {
    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    console.warn("Interactive 3D rendering is unavailable.", error);
    state.renderer = null;
    return false;
  }
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  ui.viewport.prepend(state.renderer.domElement);

  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.07;
  state.controls.minDistance = 1.5;
  state.controls.maxDistance = 20;
  resetView();

  state.scene.add(new THREE.HemisphereLight(0xc6fff1, 0x071015, 1.5));
  const key = new THREE.DirectionalLight(0xf4e7c4, 2.2);
  key.position.set(4, 6, 3);
  state.scene.add(key);

  state.world = new THREE.Group();
  state.world.rotation.x = Math.PI;
  state.scene.add(state.world);

  const grid = new THREE.GridHelper(12, 24, 0x315e61, 0x18383e);
  grid.position.y = 0.78;
  grid.material.transparent = true;
  grid.material.opacity = 0.36;
  state.world.add(grid);

  state.groundTruthGroup = new THREE.Group();
  state.predictionGroup = new THREE.Group();
  state.evidenceGroup = new THREE.Group();
  state.cameraGroup = new THREE.Group();
  state.world.add(
    state.groundTruthGroup,
    state.predictionGroup,
    state.evidenceGroup,
    state.cameraGroup,
  );
  resizeRenderer();
  return true;
}

function bindEvents() {
  ui.condition.addEventListener("change", () => setCondition(ui.condition.value));
  ui.frameSlider.addEventListener("input", () => setFrame(Number(ui.frameSlider.value)));
  ui.sceneToggle.addEventListener("change", () => {
    if (state.sceneCloud) state.sceneCloud.visible = ui.sceneToggle.checked;
  });
  ui.evidenceToggle.addEventListener("change", updateEvidenceVisibility);
  ui.camerasToggle.addEventListener("change", () => {
    if (state.cameraGroup) state.cameraGroup.visible = ui.camerasToggle.checked;
  });
  ui.groundTruthToggle.addEventListener("change", () => {
    if (state.groundTruthGroup) state.groundTruthGroup.visible = ui.groundTruthToggle.checked;
  });
  ui.resetView.addEventListener("click", resetView);
  $$("[data-mask-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.maskMode = button.dataset.maskMode;
      $$("[data-mask-mode]").forEach((item) => item.classList.toggle("active", item === button));
      updateFrameEvidence();
    });
  });
  if (state.renderer) state.renderer.domElement.addEventListener("pointerdown", handleObjectPick);
  window.addEventListener("resize", resizeRenderer);
  new ResizeObserver(resizeRenderer).observe(ui.viewport);
}

function buildGroundTruth() {
  for (const object of state.data.objects) {
    const box = object.groundTruth;
    const geometry = new THREE.BoxGeometry(...box.dimensions);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineDashedMaterial({
      color: 0xd7e8e5,
      transparent: true,
      opacity: 0.38,
      dashSize: 0.05,
      gapSize: 0.035,
    });
    const outline = new THREE.LineSegments(edges, material);
    outline.computeLineDistances();
    applyObjectTransform(outline, box);
    state.groundTruthGroup.add(outline);
  }
}

function buildCameras() {
  const trajectory = new THREE.BufferGeometry().setFromPoints(
    state.data.cameras.map((camera) => new THREE.Vector3(...camera.position)),
  );
  state.cameraGroup.add(
    new THREE.Line(
      trajectory,
      new THREE.LineBasicMaterial({ color: 0xd8b66a, transparent: true, opacity: 0.6 }),
    ),
  );
  for (const camera of state.data.cameras) state.cameraGroup.add(createFrustum(camera));
  state.cameraMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffdc85 }),
  );
  state.cameraGroup.add(state.cameraMarker);
}

function createFrustum(camera) {
  const centre = new THREE.Vector3(...camera.position);
  const transform = camera.worldFromCamera;
  const right = new THREE.Vector3(transform[0][0], transform[1][0], transform[2][0]);
  const down = new THREE.Vector3(transform[0][1], transform[1][1], transform[2][1]);
  const forward = new THREE.Vector3(transform[0][2], transform[1][2], transform[2][2]);
  const distance = 0.28;
  const halfWidth = distance * Math.tan(THREE.MathUtils.degToRad(camera.horizontalFovDegrees / 2));
  const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(camera.verticalFovDegrees / 2));
  const corner = (horizontal, vertical) => centre
    .clone()
    .addScaledVector(forward, distance)
    .addScaledVector(right, horizontal * halfWidth)
    .addScaledVector(down, vertical * halfHeight);
  const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  const points = [];
  for (const point of corners) points.push(centre, point);
  for (let index = 0; index < corners.length; index += 1) {
    points.push(corners[index], corners[(index + 1) % corners.length]);
  }
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x86b9b2, transparent: true, opacity: 0.42 }),
  );
  line.userData.frameIndex = camera.frameIndex;
  return line;
}

async function loadSceneCloud() {
  const geometry = await loadPly(state.data.scenePointCloud.path);
  state.sceneCloud = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.025,
      vertexColors: true,
      transparent: true,
      opacity: 0.48,
      sizeAttenuation: true,
    }),
  );
  state.sceneCloud.visible = ui.sceneToggle.checked;
  state.world.add(state.sceneCloud);
}

async function setCondition(conditionId) {
  state.conditionId = conditionId;
  ui.condition.value = conditionId;
  updateMetrics(currentCondition().summary);
  selectObject(state.objectId);

  if (!state.renderingAvailable) return;
  buildConditionGeometry(conditionId);
  const loadVersion = state.conditionLoadVersion;
  showStatus("Loading object point clouds…");
  const results = await Promise.allSettled([loadConditionClouds(conditionId, loadVersion)]);
  if (loadVersion === state.conditionLoadVersion) finishResourceLoad(results);
}

function buildConditionGeometry(conditionId) {
  state.conditionLoadVersion += 1;
  clearGroup(state.predictionGroup);
  clearGroup(state.evidenceGroup);
  state.hitMeshes = [];
  state.evidenceClouds.clear();
  state.predictedBoxes.clear();

  for (const object of state.data.objects) {
    const prediction = object.predictions[conditionId];
    const solid = new THREE.Mesh(
      new THREE.BoxGeometry(...prediction.dimensions),
      new THREE.MeshStandardMaterial({
        color: object.colour,
        transparent: true,
        opacity: 0.13,
        roughness: 0.48,
        metalness: 0.05,
        depthWrite: false,
      }),
    );
    solid.userData.objectId = object.id;
    applyObjectTransform(solid, prediction);
    solid.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(solid.geometry),
        new THREE.LineBasicMaterial({ color: object.colour, transparent: true, opacity: 0.9 }),
      ),
    );
    state.predictionGroup.add(solid);
    state.hitMeshes.push(solid);
    state.predictedBoxes.set(object.id, solid);
  }
  selectObject(state.objectId);
}

async function loadConditionClouds(conditionId, loadVersion) {
  const results = await Promise.allSettled(
    state.data.objects.map(async (object) => {
      const prediction = object.predictions[conditionId];
      const geometry = await loadPly(prediction.cloudPath);
      if (loadVersion !== state.conditionLoadVersion) {
        geometry.dispose();
        return;
      }
      const cloud = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          size: 0.035,
          vertexColors: true,
          transparent: true,
          opacity: 0.52,
          sizeAttenuation: true,
        }),
      );
      cloud.userData.objectId = object.id;
      state.evidenceGroup.add(cloud);
      state.evidenceClouds.set(`${conditionId}/${object.id}`, cloud);
      updateEvidenceVisibility();
    }),
  );
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) throw new AggregateError(
    failures.map((result) => result.reason),
    `${failures.length} object point cloud${failures.length === 1 ? "" : "s"} could not be loaded`,
  );
}

function finishResourceLoad(results) {
  const failures = results.filter((result) => result.status === "rejected");
  if (!failures.length) {
    hideStatus();
    return;
  }
  console.warn("Some optional 3D resources failed to load.", failures);
  showStatus(
    "Some 3D resources could not be loaded. Measurements and frame inspection remain available.",
    "warning",
  );
}

function selectObject(objectId) {
  state.objectId = objectId;
  const object = currentObject();
  const condition = currentCondition();
  const prediction = object.predictions[state.conditionId];
  ui.objectTitle.textContent = object.label;
  ui.objectSwatch.style.background = object.colour;
  ui.objectSwatch.style.color = object.colour;
  ui.objectDimensions.textContent = prediction.dimensions.map(format3).join(" × ");
  ui.objectCentroidError.textContent = format3(prediction.centroidError);
  ui.objectPoints.textContent = prediction.pointCount.toLocaleString();
  ui.objectGeometryConfidence.textContent = formatScore(prediction.meanGeometryConfidence);
  ui.objectSemanticScore.textContent = formatScore(prediction.meanSemanticScore);
  ui.objectViews.textContent = `${prediction.retainedFrames.length} / ${prediction.sourceFrames.length}`;
  [...ui.objectTabs.children].forEach((button) => {
    button.classList.toggle("active", button.dataset.objectId === objectId);
  });
  for (const [id, mesh] of state.predictedBoxes) {
    const selected = id === objectId;
    mesh.material.opacity = selected ? 0.28 : 0.08;
    mesh.children[0].material.opacity = selected ? 1 : 0.42;
  }
  updateEvidenceVisibility();
  renderSupportFrames(prediction.sourceFrames);
  renderSpatialAnswer(condition, object);
  updateFrameEvidence();
}

function renderSupportFrames(frames) {
  ui.supportFrames.replaceChildren();
  for (const frameIndex of frames) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = frameIndex;
    button.classList.toggle("active", frameIndex === state.frameIndex);
    button.addEventListener("click", () => setFrame(frameIndex));
    ui.supportFrames.append(button);
  }
}

function renderSpatialAnswer(condition, object) {
  const candidates = condition.pairwiseDistances
    .filter((item) => item.first_object_id === object.id || item.second_object_id === object.id)
    .map((item) => ({
      ...item,
      otherId: item.first_object_id === object.id ? item.second_object_id : item.first_object_id,
    }))
    .sort((first, second) => first.predicted_distance - second.predicted_distance);
  const nearest = candidates[0];
  const other = state.data.objects.find((item) => item.id === nearest.otherId);
  ui.spatialQuestion.textContent = `Which object is closest to ${object.label}?`;
  ui.spatialAnswer.innerHTML = `<strong>${other.label}</strong> is closest under the selected condition. The answer is derived from measured 3D centroids, not language-model estimation.`;
  ui.distanceComparison.innerHTML = [
    ["Predicted", format3(nearest.predicted_distance)],
    ["Ground truth", format3(nearest.ground_truth_distance)],
    ["Absolute error", format3(nearest.absolute_error)],
  ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("");
}

function setFrame(frameIndex) {
  state.frameIndex = frameIndex;
  ui.frameSlider.value = frameIndex;
  const camera = state.data.cameras[frameIndex];
  ui.frame.src = camera.framePath;
  ui.frameTitle.textContent = `Source frame ${frameIndex}`;
  ui.frameTime.textContent = `${camera.timestampSeconds.toFixed(2)} s`;
  ui.frameBadge.textContent = `F${String(frameIndex).padStart(2, "0")}`;
  if (state.cameraMarker) state.cameraMarker.position.fromArray(camera.position);
  updateFrameEvidence();
  renderSupportFrames(currentObject().predictions[state.conditionId].sourceFrames);
}

function updateFrameEvidence() {
  const object = currentObject();
  const mode = state.maskMode;
  const path = mode === "off" ? null : object.masks[mode]?.[String(state.frameIndex)];
  ui.overlay.hidden = !path;
  if (path) ui.overlay.src = path;
  if (mode === "off") ui.maskStatus.textContent = "Mask overlay disabled";
  else if (path) ui.maskStatus.textContent = `${mode === "sam3" ? "SAM 3" : "Exact"} mask available`;
  else ui.maskStatus.textContent = `No ${mode === "sam3" ? "SAM 3 track" : "visible surface"} in this frame`;
}

function updateEvidenceVisibility() {
  if (!state.evidenceGroup) return;
  for (const cloud of state.evidenceGroup.children) {
    const selected = cloud.userData.objectId === state.objectId;
    cloud.visible = ui.evidenceToggle.checked;
    cloud.material.opacity = selected ? 0.92 : 0.16;
    cloud.material.size = selected ? 0.045 : 0.024;
  }
}

function updateMetrics(summary) {
  ui.centroidMetric.textContent = format3(summary.mean_centroid_error);
  ui.dimensionMetric.textContent = `${(summary.mean_dimension_relative_mae * 100).toFixed(1)}%`;
  ui.pairwiseMetric.textContent = format3(summary.mean_pairwise_distance_error);
  ui.nearestMetric.textContent = `${(summary.nearest_neighbour_accuracy * 100).toFixed(0)}%`;
}

function handleObjectPick(event) {
  const bounds = state.renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, state.camera);
  const hit = raycaster.intersectObjects(state.hitMeshes, false)[0];
  if (hit) selectObject(hit.object.userData.objectId);
}

function applyObjectTransform(mesh, object) {
  const rotation = object.rotationWorldFromBox;
  const matrix = new THREE.Matrix4().set(
    rotation[0][0], rotation[0][1], rotation[0][2], 0,
    rotation[1][0], rotation[1][1], rotation[1][2], 0,
    rotation[2][0], rotation[2][1], rotation[2][2], 0,
    0, 0, 0, 1,
  );
  mesh.quaternion.setFromRotationMatrix(matrix);
  mesh.position.fromArray(object.centroid);
}

function loadPly(path) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback(value);
    };
    const timeoutId = window.setTimeout(
      () => finish(reject, new Error(`${path} timed out after ${RESOURCE_TIMEOUT_MS / 1000} seconds`)),
      RESOURCE_TIMEOUT_MS,
    );
    plyLoader.load(
      path,
      (geometry) => {
        geometry.computeBoundingSphere();
        finish(resolve, geometry);
      },
      undefined,
      (error) => finish(reject, new Error(`${path} could not be loaded: ${error?.message || error}`)),
    );
  });
}

function clearGroup(group) {
  if (!group) return;
  while (group.children.length) {
    const child = group.children.pop();
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  }
}

function currentCondition() {
  return state.data.conditions.find((condition) => condition.id === state.conditionId);
}

function currentObject() {
  return state.data.objects.find((object) => object.id === state.objectId);
}

function resetView() {
  if (!state.camera || !state.controls) return;
  state.camera.position.set(4.8, 3.2, 3.7);
  state.controls.target.set(0, 0, -4.4);
  state.controls.update();
}

function resizeRenderer() {
  if (!state.renderer) return;
  const width = ui.viewport.clientWidth;
  const height = ui.viewport.clientHeight;
  if (!width || !height) return;
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
}

function animate() {
  if (!state.renderer) return;
  requestAnimationFrame(animate);
  state.controls.update();
  state.renderer.render(state.scene, state.camera);
}

function showStatus(message, kind = "loading") {
  ui.status.hidden = false;
  ui.status.classList.remove("error", "fallback", "warning");
  if (kind !== "loading") ui.status.classList.add(kind);
  ui.status.textContent = message;
}

function hideStatus() {
  ui.status.hidden = true;
}

function showRenderingFallback() {
  ui.viewport.classList.add("rendering-fallback");
  ui.status.classList.add("fallback");
  ui.status.innerHTML = "<strong>Interactive 3D view unavailable</strong><span>This browser could not create a WebGL context. The evaluation metrics and frame inspection remain fully available.</span>";
  $$(".viewport-toolbar input, #reset-view").forEach((control) => {
    control.disabled = true;
  });
}

function format3(value) {
  return Number(value).toFixed(3);
}

function formatScore(value) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return Number(value).toFixed(3);
}
