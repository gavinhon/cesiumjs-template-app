import * as Cesium from 'cesium';
import { DECODE_HEIGHT_GLSL, type TerrainHeightmap } from '@/cesium/terrainHeightmap';
import { WORLDWIDE_RADIUS } from './placeTilesetOnTerrain';

const VERTEX_SHADER = `
  float drapeHeightAt(vec2 texel) {
    vec4 c = texture(u_drapeHeights, (texel + 0.5) / u_drapeSize);
    return ${DECODE_HEIGHT_GLSL};
  }

  void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
    vec3 world = (czm_model * vec4(vsOutput.positionMC, 1.0)).xyz;
    float longitude = atan(world.y, world.x);
    float latitude = atan(world.z, (1.0 - 0.0066943799901413165) * length(world.xy));

    vec2 texel = (vec2(longitude, latitude) - u_drapeOrigin) / u_drapeTexel - 0.5;
    if (any(lessThan(texel, vec2(-0.5))) || any(greaterThan(texel, u_drapeSize - 0.5))) {
      return;
    }
    vec2 low = clamp(floor(texel), vec2(0.0), u_drapeSize - 1.0);
    vec2 high = min(low + 1.0, u_drapeSize - 1.0);
    vec2 t = clamp(texel - low, 0.0, 1.0);
    float ground = mix(
      mix(drapeHeightAt(low), drapeHeightAt(vec2(high.x, low.y)), t.x),
      mix(drapeHeightAt(vec2(low.x, high.y)), drapeHeightAt(high), t.x),
      t.y
    );

    vec3 up = vec3(cos(latitude) * cos(longitude), cos(latitude) * sin(longitude), sin(latitude));
    vsOutput.positionMC += (czm_inverseModel * vec4(up * (ground - u_drapeDatum), 0.0)).xyz;
  }
`;

export function createDrapeShader(heightmap: TerrainHeightmap, datum: number): Cesium.CustomShader {
  return new Cesium.CustomShader({
    uniforms: {
      u_drapeHeights: {
        type: Cesium.UniformType.SAMPLER_2D,
        value: new Cesium.TextureUniform({
          typedArray: heightmap.pixels,
          width: heightmap.width,
          height: heightmap.height,
          repeat: false,
          minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
          magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
        }),
      },
      u_drapeOrigin: {
        type: Cesium.UniformType.VEC2,
        value: new Cesium.Cartesian2(heightmap.west, heightmap.south),
      },
      u_drapeTexel: {
        type: Cesium.UniformType.VEC2,
        value: new Cesium.Cartesian2(heightmap.texelWidth, heightmap.texelHeight),
      },
      u_drapeSize: {
        type: Cesium.UniformType.VEC2,
        value: new Cesium.Cartesian2(heightmap.width, heightmap.height),
      },
      u_drapeDatum: { type: Cesium.UniformType.FLOAT, value: datum },
    },
    vertexShaderText: VERTEX_SHADER,
  });
}

export function applyDrape(
  tilesets: readonly Cesium.Cesium3DTileset[],
  shader: Cesium.CustomShader | undefined,
): void {
  for (const tileset of tilesets) tileset.customShader = shader;
}

export function drapeArea(
  primitive: Cesium.Cesium3DTileset | Cesium.I3SDataProvider,
): Cesium.Rectangle {
  if (primitive instanceof Cesium.I3SDataProvider && primitive.extent) return primitive.extent;
  const sphere = primitive instanceof Cesium.Cesium3DTileset ? primitive.boundingSphere : undefined;
  return sphere && sphere.radius < WORLDWIDE_RADIUS
    ? Cesium.Rectangle.fromBoundingSphere(sphere)
    : Cesium.Rectangle.MAX_VALUE;
}
