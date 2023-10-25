"use strict";

const headerSize = 24; // Length of AEM headers in bytes
const textureStringSize = 64; // Length of an AEM string in bytes
const vertexSize = 11; // Length of an AEM vertex in bytes

async function loadModels(...pathes) {
  const modelInfos = new Array();

  const meshRenderInfoContainer = new Array();
  const materialDefinitions = new Array();
  const textureFilenames = new Array();

  let totalVertexCount = 0;
  let totalIndexCount = 0;

  // Open and parse the headers of all model files
  for (const path of pathes) {
    const response = await fetch(path);
    const data = await response.arrayBuffer();
    const header = new DataView(data, 0, headerSize);

    // Check the magic number
    const magicNumberString = String.fromCharCode(header.getUint8(0), header.getUint8(1), header.getUint8(2));
    if (magicNumberString != "AEM") {
      throw new Error("Failed to load model " + path + ": Unsupported magic number " + magicNumberString + ", expected AEM.");
    }

    // Check the file version
    const version = header.getUint8(3, true);
    if (version != 1) {
      throw new Error("Failed to load model " + path + ": Unsupported version number " + version + ", expected 1.");
    }

    // Read the vertex, index, mesh and material counts
    const vertexCount = header.getUint32(4, true);
    const indexCount = header.getUint32(8, true);
    const meshCount = header.getUint32(12, true);
    const materialCount = header.getUint32(16, true);
    const textureCount = header.getUint32(20, true);

    modelInfos.push([data, vertexCount, indexCount, meshCount, materialCount, textureCount]);

    totalVertexCount += vertexCount;
    totalIndexCount += indexCount;
  }

  // Create a vertex and index buffer for all the vertices and indices in all of the models
  const vertices = new Float32Array(totalVertexCount * vertexSize);
  const indices = new Uint32Array(totalIndexCount);

  // Load the actual data of each model
  let vertexOffsetPerModel = 0;
  let indexOffsetPerModel = 0;
  let textureIndexOffsetPerModel = 0;
  for (const modelInfo of modelInfos) {
    const [modelData, modelVertexCount, modelIndexCount, modelMeshCount, modelMaterialCount, modelTextureCount] = modelInfo;

    // Copy the vertices for this entire model into the vertex buffer
    const modelVertices = new Float32Array(modelData, headerSize, modelVertexCount * vertexSize);
    vertices.set(modelVertices, vertexOffsetPerModel * vertexSize);

    // Copy the indices for this entire model into the index buffer
    const modelIndices = new Uint32Array(modelData, headerSize + modelVertexCount * vertexSize * 4, modelIndexCount);
    indices.set(modelIndices, indexOffsetPerModel);

    // Mesh section
    let indexOffsetPerMesh = 0;
    const meshSectionOffset = headerSize + modelVertexCount * vertexSize * 4 + modelIndexCount * 4;
    const meshSectionSize = modelMeshCount * (4 + 1)
    const meshSection = new DataView(modelData, meshSectionOffset, meshSectionSize);
    const meshRenderInfos = new Array();
    for (let i = 0; i < modelMeshCount; i++) {
      const meshIndexCount = meshSection.getUint32(i * 5 + 0, true);
      const meshMaterialIndex = meshSection.getUint8(i * 5 + 4, true);

      const firstIndex = indexOffsetPerModel + indexOffsetPerMesh;
      const firstVertex = vertexOffsetPerModel;
      const materialIndex = meshMaterialIndex;
      const meshRenderInfo = [meshIndexCount, firstIndex, firstVertex, materialIndex];
      meshRenderInfos.push(meshRenderInfo);

      indexOffsetPerMesh += meshIndexCount;
    }

    // Material section
    const materialSectionOffset = meshSectionOffset + meshSectionSize;
    const materialSectionSize = modelMaterialCount * 2;
    const materialSection = new DataView(modelData, materialSectionOffset, materialSectionSize);
    for (let i = 0; i < modelMaterialCount; i++) {
      const diffuseTextureIndex = materialSection.getUint8(i * 2 + 0);
      const normalTextureIndex = materialSection.getUint8(i * 2 + 1);
      const materialDefinition = { diffuse: diffuseTextureIndex, normal: normalTextureIndex };
      materialDefinitions.push(materialDefinition);
    }

    // Texture section
    const textureSectionOffset = materialSectionOffset + materialSectionSize;
    for (let i = 0; i < modelTextureCount; i++) {
      let stringBuffer = new Uint8Array(modelData, textureSectionOffset + i * textureStringSize, textureStringSize);
      let textureFilename = String.fromCharCode.apply(null, stringBuffer);
      textureFilename = textureFilename.substring(0, textureFilename.indexOf('\0')); // Remove extra zeros from end of string TODO: Is this necessary?
      textureFilenames.push(textureFilename);
    }

    vertexOffsetPerModel += modelVertexCount;
    indexOffsetPerModel += modelIndexCount;
    textureIndexOffsetPerModel += modelTextureCount;

    meshRenderInfoContainer.push(meshRenderInfos);
  }

  return [vertices, indices, meshRenderInfoContainer, materialDefinitions, textureFilenames];
}

function renderModel(model, worldMatrixOffset, materialBindGroups, modelBindGroup, renderPass) {
  const dynamicOffsets = [worldMatrixOffset];

  const fallbackMaterialBindGroup = materialBindGroups[materialBindGroups.length - 1];

  // Render all meshes
  for (const mesh of model.meshes) {
    let [indexCount, firstIndex, firstVertex, materialIndex] = mesh; // Unpack the mesh

    if (materialIndex < 255) {
      renderPass.setBindGroup(1, materialBindGroups[materialIndex]);
    }
    else {
      // Fallback if the mesh does not have a valid material assigned
      renderPass.setBindGroup(1, fallbackMaterialBindGroup);
    }

    renderPass.setBindGroup(2, modelBindGroup, dynamicOffsets);

    renderPass.drawIndexed(indexCount, 1, firstIndex, firstVertex); // Draw the mesh
  }
}

export { loadModels, renderModel };