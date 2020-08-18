  # define maxLights 64

  varying highp vec2 vTextureCoord;
  varying highp vec4 vTransformedNormal;
  varying highp vec3 vFragPos;

  uniform sampler2D uSampler;
  uniform highp vec3 uAmbiantLight;
  uniform highp vec3 uDirectionalLightsColor[maxLights];
  uniform highp vec3 uDirectionalsVector[maxLights];
  uniform highp vec3 uPointLightsColor[maxLights];
  uniform highp vec3 uPointLightsPositions[maxLights];
  uniform highp mat4 uViewRotationMatrix;
  uniform highp float uReflectivity;
  uniform highp int uExponant;

void main() {
  highp vec4 texelColor = texture2D(uSampler, vTextureCoord);
  
  // camera position but because i don't have a camera but just move the whole world its always at 0
  lowp vec3 viewPose = vec3(0);
  highp vec3 normal = normalize(vTransformedNormal.xyz);

  highp vec3 surfaceToLightDirrection[maxLights];
  highp vec3 viewDir = normalize(viewPose - vFragPos);

  for(int l = 0; l < maxLights; l++) {
    surfaceToLightDirrection[l] = normalize(uPointLightsPositions[l] - vFragPos);
  }

  highp vec3 dDiffuse = vec3(0);
  for(int i = 0; i < maxLights; i++) {
    highp float dirrectional = max(dot(normal, (uViewRotationMatrix * vec4(uDirectionalsVector[i], 1)).xyz), 0.0);
    dDiffuse += uDirectionalLightsColor[i] * dirrectional;
  }

  highp vec3 pSpecular = vec3(0);
  highp vec3 pDiffuse = vec3(0);
  for(int j = 0; j < maxLights; j++) {
    highp vec3 reflectDir = reflect(-surfaceToLightDirrection[j], normal);
    highp float spec = pow(max(dot(viewDir, reflectDir), 0.0), float(uExponant));
    highp float diff = max(dot(normal, surfaceToLightDirrection[j]), 0.0);
    pDiffuse += uPointLightsColor[j] * diff;
    pSpecular += uReflectivity * spec * uPointLightsColor[j];
  }
  
  highp vec3 light = uAmbiantLight + pDiffuse + dDiffuse + pSpecular;
  gl_FragColor = vec4(texelColor.rgb * (light), texelColor.a);

}