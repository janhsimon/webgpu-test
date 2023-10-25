"use strict";

async function loadTexture(path, device) {
  const response = await fetch(path).catch(console.error);;
  const data = await response.blob();
  const image = await createImageBitmap(data);

  const texture = device.createTexture({
    label: "Texture " + path,
    size: [image.width, image.height, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });

  device.queue.copyExternalImageToTexture(
    { source: image },
    { texture: texture },
    [image.width, image.height]
  );

  return texture.createView();
}

export { loadTexture };