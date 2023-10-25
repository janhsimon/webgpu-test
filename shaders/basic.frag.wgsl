struct Input {
  @location(0) normal: vec3<f32>,
  @location(1) tangent: vec3<f32>,
  @location(2) bitangent: vec3<f32>,
  @location(3) uv: vec2<f32>,
  @location(4) worldPos: vec3<f32>
};

struct Scene {
  viewProjectionMatrix: mat4x4<f32>,
  cameraPos: vec4<f32>,
  lightDir: vec4<f32>
};

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var basicSampler: sampler;
@group(1) @binding(0) var diffuseTexture: texture_2d<f32>;
@group(1) @binding(1) var normalTexture: texture_2d<f32>;

@fragment
fn main(input: Input) -> @location(0) vec4<f32> {
  // Normal mapping
  var normalSample: vec3<f32> = textureSample(normalTexture, basicSampler, input.uv).rgb * 2 - 1;
  var TBN: mat3x3<f32> = mat3x3<f32>(input.tangent, input.bitangent, input.normal);
  var normal: vec3<f32> = TBN * normalize(normalSample);
  
  // Diffuse
  var baseColorSample: vec4<f32> = textureSample(diffuseTexture, basicSampler, input.uv);
  var diffuse: f32 = saturate(dot(normal, -scene.lightDir.xyz));

  // Specular
  var fragmentToEye: vec3<f32> = normalize(scene.cameraPos.xyz - input.worldPos.xyz);
  var lightReflect: vec3<f32> = normalize(reflect(scene.lightDir.xyz, normal));
	var specular: f32 = pow(saturate(dot(fragmentToEye, lightReflect)), /*roughness*/0.5 * 10.0) /* lightColor * lightIntensity*/;

  return vec4<f32>(baseColorSample.rgb * (diffuse + specular), baseColorSample.a);
}