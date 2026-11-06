import { tUi } from "$/i18n";
import type {
  NormalMapLightFrame,
  NormalMapLightRendererPort,
} from "$/managers/ports/normal-map-rendering";
import type { PixelBuffer } from "@xprite/editor-core/base";

const VERTEX_SOURCE = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;
const FRAGMENT_SOURCE = `
precision highp float;
uniform sampler2D albedo;
uniform sampler2D normals;
uniform vec2 imageSize;
uniform vec2 viewport;
uniform vec2 origin;
uniform vec3 light;
uniform vec3 lightColor;
uniform float zoom;
uniform float pixelRatio;
uniform float power;
uniform float ambient;
uniform float radius;
uniform float normalSign;
uniform bool hasNormals;
vec3 linearColor(vec3 color) {
  return mix(color / 12.92, pow((color + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), color));
}
vec3 encodedColor(vec3 color) {
  return mix(color * 12.92, 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), color));
}
void main() {
  vec2 screen = vec2(gl_FragCoord.x, viewport.y - gl_FragCoord.y) / pixelRatio;
  vec2 pixel = floor((screen - origin) / zoom);
  if (any(lessThan(pixel, vec2(0.0))) || any(greaterThanEqual(pixel, imageSize))) {
    gl_FragColor = vec4(0.0); return;
  }
  vec2 uv = (pixel + 0.5) / imageSize;
  vec4 base = texture2D(albedo, uv);
  if (base.a == 0.0) { gl_FragColor = vec4(0.0); return; }
  vec4 value = texture2D(normals, uv);
  vec3 normal = hasNormals && value.a > 0.0 ? value.rgb * 2.0 - 1.0 : vec3(0.0, 0.0, 1.0);
  normal.y *= normalSign;
  normal /= max(length(normal), 0.000001);
  vec3 direction = vec3(light.x - pixel.x, pixel.y - light.y, light.z);
  float distanceSquared = dot(direction, direction);
  float diffuse = max(0.0, dot(normal, direction) * inversesqrt(max(distanceSquared, 0.000001)));
  float direct = power * diffuse / (1.0 + distanceSquared / (radius * radius));
  vec3 color = encodedColor(linearColor(base.rgb) * (ambient + direct * linearColor(lightColor)));
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
}
`;
const VERTEX_COMPONENTS = 2;
const VERTEX_COUNT = 6;
const LIGHT_RADIUS_FACTOR = 0.75;
const PERCENT = 100;
const BYTE_MAX = 255;

/** Textures stay on the GPU; a moving light changes uniforms and one viewport-sized draw. */
export function createBrowserNormalMapLightRenderer(
  canvas: HTMLCanvasElement,
): NormalMapLightRendererPort | null {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;
  const shader = (type: number, code: string) => {
    const value = gl.createShader(type)!;
    gl.shaderSource(value, code);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
      gl.deleteShader(value);
      throw new Error(tUi("normal.processing.failed"));
    }
    return value;
  };
  const vertex = shader(gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, VERTEX_COMPONENTS, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const texture = (unit: number) => {
    const result = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, result);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return result;
  };
  const colorTexture = texture(0),
    normalTexture = texture(1);
  const names = [
    "imageSize",
    "viewport",
    "origin",
    "light",
    "lightColor",
    "zoom",
    "pixelRatio",
    "power",
    "ambient",
    "radius",
    "normalSign",
    "hasNormals",
  ] as const;
  const locations = Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Record<(typeof names)[number], WebGLUniformLocation | null>;
  gl.uniform1i(gl.getUniformLocation(program, "albedo"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "normals"), 1);
  let source: PixelBuffer | null = null,
    normals: PixelBuffer | null | undefined;
  let width = 0,
    height = 0;
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const upload = (unit: number, value: PixelBuffer | null) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (value)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        value.width,
        value.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        value.data,
      );
    else
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([128, 128, BYTE_MAX, 0]),
      );
  };
  return {
    render(frame: NormalMapLightFrame) {
      if (gl.isContextLost()) throw new Error(tUi("normal.processing.failed"));
      if (frame.source.width > maxTextureSize || frame.source.height > maxTextureSize)
        throw new RangeError(tUi("normal.processing.failed"));
      const nextWidth = Math.max(1, Math.round(frame.viewport.width * frame.pixelRatio));
      const nextHeight = Math.max(1, Math.round(frame.viewport.height * frame.pixelRatio));
      if (width !== nextWidth || height !== nextHeight) {
        width = canvas.width = nextWidth;
        height = canvas.height = nextHeight;
        gl.viewport(0, 0, width, height);
      }
      if (source !== frame.source) {
        upload(0, frame.source);
        source = frame.source;
      }
      if (normals !== frame.normals) {
        upload(1, frame.normals);
        normals = frame.normals;
      }
      gl.uniform2f(locations.imageSize, source.width, source.height);
      gl.uniform2f(locations.viewport, width, height);
      gl.uniform2f(locations.origin, frame.origin.x, frame.origin.y);
      gl.uniform3f(
        locations.light,
        frame.options.position.x,
        frame.options.position.y,
        Math.max(0.000001, frame.options.height),
      );
      gl.uniform3f(
        locations.lightColor,
        frame.options.color[0] / BYTE_MAX,
        frame.options.color[1] / BYTE_MAX,
        frame.options.color[2] / BYTE_MAX,
      );
      gl.uniform1f(locations.zoom, frame.zoom);
      gl.uniform1f(locations.pixelRatio, frame.pixelRatio);
      gl.uniform1f(locations.power, frame.options.brightness / PERCENT);
      gl.uniform1f(locations.ambient, frame.options.ambient / PERCENT);
      gl.uniform1f(
        locations.radius,
        Math.max(1, Math.max(source.width, source.height) * LIGHT_RADIUS_FACTOR),
      );
      gl.uniform1f(locations.normalSign, frame.options.invertY ? -1 : 1);
      gl.uniform1i(locations.hasNormals, frame.normals !== null ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, VERTEX_COUNT);
    },
    dispose() {
      gl.deleteTexture(colorTexture);
      gl.deleteTexture(normalTexture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
