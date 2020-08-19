  # define maxLights 64
  attribute vec4 aVertexPosition;
  attribute vec4 aVertexNormal;
  attribute vec2 aTextureCoord;

  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;
  uniform mat4 uNormalMatrix;

  varying highp vec2 vTextureCoord;
  varying highp vec4 vTransformedNormal;
  varying highp vec3 vFragPos;

  void main() {
    highp vec4 p = uModelViewMatrix * aVertexPosition;
    gl_Position = uProjectionMatrix * p;
    vTextureCoord = aTextureCoord;
    vFragPos = vec3(p);
    vTransformedNormal = uNormalMatrix * vec4(aVertexNormal.xyz, 0.0);
  }