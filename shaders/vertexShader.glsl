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
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vTextureCoord = aTextureCoord;
    vFragPos = vec3(uModelViewMatrix * aVertexPosition);
    vTransformedNormal = uNormalMatrix * aVertexNormal;
  }