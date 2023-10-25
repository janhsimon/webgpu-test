"use strict";

import { vec3, mat4 } from "./external/wgpu-matrix.module.js";

let cameraTransform, cameraPivot;

function loadCamera(position, target) {
  cameraPivot = target;
  const z = vec3.normalize(vec3.sub(target, position));
  const x = vec3.cross([0, 1, 0], z);
  const y = vec3.cross(z, x);
  cameraTransform = mat4.create(x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, position[0], position[1], position[2], 1);
}

function getCameraPosition() {
  return mat4.getTranslation(cameraTransform);
}

function tumbleCamera(deltaX, deltaY) {
  const positionToPivot = vec3.sub(cameraPivot, getCameraPosition());
  const moveToPivot = mat4.translation(positionToPivot);

  const yaw = mat4.rotationY(-deltaX * (Math.PI / 180) * 0.1);
  let right = mat4.getAxis(cameraTransform, 0);
  right = vec3.transformMat4(right, yaw);

  const pitch = mat4.rotation(right, deltaY * (Math.PI / 180) * 0.1);

  const rot = mat4.multiply(pitch, yaw);

  const moveBack = mat4.translation([-positionToPivot[0], -positionToPivot[1], -positionToPivot[2]]);

  cameraTransform = mat4.multiply(mat4.multiply(moveBack, mat4.multiply(moveToPivot, rot)), cameraTransform);
}

function panCamera(deltaX, deltaY) {
  const positionToPivot = vec3.sub(cameraPivot, getCameraPosition());
  const distance = vec3.length(positionToPivot);

  const moveX = mat4.translation(vec3.mulScalar(mat4.getAxis(cameraTransform, 0), deltaX * distance * 0.001));
  const moveY = mat4.translation(vec3.mulScalar(mat4.getAxis(cameraTransform, 1), deltaY * distance * 0.001));
  const move = mat4.multiply(moveY, moveX);

  cameraTransform = mat4.multiply(move, cameraTransform);
  cameraPivot = vec3.transformMat4(cameraPivot, move);
}

function dollyCamera(delta) {
  const positionToPivot = vec3.sub(cameraPivot, getCameraPosition());
  const newPosition = vec3.sub(cameraPivot, vec3.mulScalar(positionToPivot, delta > 0 ? 1.1 : 0.9));
  cameraTransform = mat4.setTranslation(cameraTransform, newPosition);
}

function calculateViewMatrix() {
  const position = getCameraPosition();
  const up = mat4.getAxis(cameraTransform, 1);
  const forward = mat4.getAxis(cameraTransform, 2);
  const target = vec3.add(position, forward);
  return mat4.lookAt(position, target, up);
}

export { loadCamera, getCameraPosition, tumbleCamera, panCamera, dollyCamera, calculateViewMatrix };