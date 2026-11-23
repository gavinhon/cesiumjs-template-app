import * as Cesium from 'cesium';
import { DECODE_HEIGHT_GLSL, type TerrainHeightmap } from '@/cesium/terrainHeightmap';

/**
 * Stands every vertex of a model on the terrain beneath it — what a city
 * layer built on flat ground needs, and what ArcGIS does for a scene layer
 * whose `elevationInfo` says `relativeToGround`.
 *
 * Cesium can't do it: it clamps points and lines in a tileset to the
 * ground (`heightReference`), never a mesh, and moving a whole city layer
 * up or down can't fit an island whose ground varies by 160 m. So a vertex
 * shader adds the terrain height under each vertex, read from a
 * `TerrainHeightmap`, minus the height the layer counts as its ground
 * (`datum`: the geoid, for I3S that Cesium converted from sea level).
 *
 * Three things follow from moving vertices on the GPU:
 *
 *  - Each vertex gets the ground under *it*, so a roof follows the slope
 *    the building stands on, by the terrain's change across its footprint
 *    — a metre or two for a block on a hillside. It's also how ArcGIS
 *    drapes a ground-relative layer.
 *  - Cesium culls tiles by the bounds they declared, which the shader
 *    doesn't move. A tile lifted far above them can blink out at the edge
 *    of the screen; across Singapore the lift is tens of metres, against
 *    tiles hundreds across, so it's rare.
 *  - Picking renders the same shader, so a click lands on the draped roof.
 */
const VERTEX_SHADER = /* glsl */ `
  float drapeHeightAt(vec2 texel) {
    vec4 c = texture(u_drapeHeights, (texel + 0.5) / u_drapeSize);
    return ${DECODE_HEIGHT_GLSL};
  }

  void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
    // World position, to find where the vertex is. Single precision is
    // ~0.5 m out at the Earth's radius: plenty to pick a 38 m texel, and
    // the vertex itself is moved in model space, losing nothing.
    vec3 world = (czm_model * vec4(vsOutput.positionMC, 1.0)).xyz;
    float longitude = atan(world.y, world.x);
    // Geodetic latitude (the ellipsoid's, not the angle from the centre —
    // those differ by ~1 km of ground at Singapore's latitude).
    float latitude = atan(world.z, (1.0 - 0.0066943799901413165) * length(world.xy));

    vec2 texel = (vec2(longitude, latitude) - u_drapeOrigin) / u_drapeTexel - 0.5;
    // Outside the heightmap there's no terrain to stand on: leave it be.
    if (any(lessThan(texel, vec2(-0.5))) || any(greaterThan(texel, u_drapeSize - 0.5))) {
      return;
    }
    // Bilinear by hand: the texture holds two bytes per height, which the
    // sampler's own filtering would blend into nonsense.
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

/**
 * A shader draping a model on `heightmap`, its ground counted from
 * `datum` metres above the ellipsoid. One per model, since the datum is
 * per model, and a new one whenever the terrain changes.
 */
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
          // Exact texels: the shader interpolates the decoded heights itself.
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

/** Drapes `tilesets` with `shader`, or undrapes them for `undefined`. */
export function applyDrape(
  tilesets: readonly Cesium.Cesium3DTileset[],
  shader: Cesium.CustomShader | undefined,
): void {
  for (const tileset of tilesets) tileset.customShader = shader;
}

/**
 * The area a model's heightmap has to cover: an I3S scene's declared
 * extent, or a tileset's bounding sphere — for a worldwide layer that's
 * the world, which `terrainHeightmap` narrows to wherever the terrain has
 * tiles.
 */
export function drapeArea(
  primitive: Cesium.Cesium3DTileset | Cesium.I3SDataProvider,
): Cesium.Rectangle {
  if (primitive instanceof Cesium.I3SDataProvider && primitive.extent) return primitive.extent;
  const sphere = primitive instanceof Cesium.Cesium3DTileset ? primitive.boundingSphere : undefined;
  return sphere && sphere.radius < 1_000_000
    ? Cesium.Rectangle.fromBoundingSphere(sphere)
    : Cesium.Rectangle.MAX_VALUE;
}
