"use strict";

async function loadShader(path, device) {
  const response = await fetch(path);
  const source = await response.text();

  const shaderProgram = device.createShaderModule({
    label: "Shader " + path,
    code: source
  });

  const compilationInfo = await shaderProgram.getCompilationInfo();
  for (const message of compilationInfo.messages) {
    if (message.type == "error") {
      throw new Error(message.message);
    }
  }

  return shaderProgram;
}

export { loadShader };