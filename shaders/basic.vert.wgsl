struct Input {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) tangent: vec3<f32>,
  @location(3) uv: vec2<f32>
};

struct Output {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) tangent: vec3<f32>,
  @location(2) bitangent: vec3<f32>,
  @location(3) uv: vec2<f32>,
  @location(4) worldPos: vec3<f32>
};

struct Scene {
  viewProjectionMatrix: mat4x4<f32>,
  lightPosition: vec3<f32>
};

struct Model {
  worldMatrix: mat4x4<f32>
}

@group(0) @binding(0) var<uniform> scene: Scene;
@group(2) @binding(0) var<uniform> model: Model;

@vertex
fn main(input: Input) -> Output {
  var output: Output;

  var wp: vec4<f32> = model.worldMatrix * vec4<f32>(input.position, 1);
  output.position = scene.viewProjectionMatrix * wp;
  output.worldPos = wp.xyz;
  
  output.normal = normalize((model.worldMatrix * vec4<f32>(input.normal, 0)).xyz);
  output.tangent = normalize((model.worldMatrix * vec4<f32>(input.tangent, 0)).xyz);
  output.bitangent = normalize((model.worldMatrix * vec4<f32>(cross(input.normal, input.tangent), 0)).xyz);

  output.uv = input.uv;

  return output;
}