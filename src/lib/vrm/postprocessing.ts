import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { BleachBypassShader } from 'three/examples/jsm/shaders/BleachBypassShader.js';
import { ColorCorrectionShader } from 'three/examples/jsm/shaders/ColorCorrectionShader.js';

const ChromaticAberrationShader = {
	uniforms: {
		tDiffuse: { value: null },
		amount: { value: 0.0015 },
		angle: { value: 0.0 }
	},
	vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
	fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float angle;
    varying vec2 vUv;
    void main() {
      vec2 offset = amount * vec2(cos(angle), sin(angle));
      vec4 cr = texture2D(tDiffuse, vUv + offset);
      vec4 cga = texture2D(tDiffuse, vUv);
      vec4 cb = texture2D(tDiffuse, vUv - offset);
      gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);
    }
  `
};

const FilmGrainShader = {
	uniforms: {
		tDiffuse: { value: null },
		time: { value: 0.0 },
		grainAmount: { value: 0.05 },
		vignetteAmount: { value: 0.3 },
		vignetteHardness: { value: 0.8 }
	},
	vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
	fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grainAmount;
    uniform float vignetteAmount;
    uniform float vignetteHardness;
    varying vec2 vUv;
    float random(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float grain = random(vUv * time) * grainAmount;
      color.rgb += grain - grainAmount * 0.5;
      vec2 uv = vUv * (1.0 - vUv.yx);
      float vig = uv.x * uv.y * 15.0;
      vig = pow(vig, vignetteHardness);
      color.rgb = mix(color.rgb, color.rgb * vig, vignetteAmount);
      gl_FragColor = color;
    }
  `
};

export interface PostProcessingRefs {
	composer: EffectComposer;
	outlineEffect: OutlineEffect;
	bloomPass: UnrealBloomPass;
	fxaaPass: ShaderPass;
	smaaPass: SMAAPass;
	taaPass: TAARenderPass;
	chromaticAberrationPass: ShaderPass;
	filmGrainPass: ShaderPass;
	outlinePass: OutlinePass;
	glitchPass: GlitchPass;
	bleachBypassPass: ShaderPass;
	colorCorrectionPass: ShaderPass;
}

export function initPostProcessing(
	renderer: THREE.WebGLRenderer,
	scene: THREE.Scene,
	camera: THREE.PerspectiveCamera
): PostProcessingRefs {
	const outlineEffect = new OutlineEffect(renderer, {
		defaultThickness: 0.003,
		defaultColor: [0, 0, 0],
		defaultAlpha: 0.8,
		defaultKeepAlive: true
	});

	const composer = new EffectComposer(renderer);

	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	const bloomPass = new UnrealBloomPass(
		new THREE.Vector2(window.innerWidth, window.innerHeight),
		0.4,
		0.6,
		0.7
	);
	bloomPass.enabled = false;
	composer.addPass(bloomPass);

	const outlinePass = new OutlinePass(
		new THREE.Vector2(window.innerWidth, window.innerHeight),
		scene,
		camera
	);
	outlinePass.edgeStrength = 3.0;
	outlinePass.edgeGlow = 0.5;
	outlinePass.edgeThickness = 1.5;
	outlinePass.visibleEdgeColor.set('#38bdf8');
	outlinePass.hiddenEdgeColor.set('#1e293b');
	outlinePass.enabled = false;
	composer.addPass(outlinePass);

	const glitchPass = new GlitchPass();
	glitchPass.enabled = false;
	composer.addPass(glitchPass);

	const bleachBypassPass = new ShaderPass(BleachBypassShader);
	bleachBypassPass.uniforms['opacity'].value = 0.2;
	bleachBypassPass.enabled = false;
	composer.addPass(bleachBypassPass);

	const colorCorrectionPass = new ShaderPass(ColorCorrectionShader);
	colorCorrectionPass.uniforms['powRGB'].value.set(1.4, 1.45, 1.45);
	colorCorrectionPass.uniforms['mulRGB'].value.set(1.1, 1.1, 1.1);
	colorCorrectionPass.enabled = false;
	composer.addPass(colorCorrectionPass);

	const chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);
	chromaticAberrationPass.enabled = false;
	composer.addPass(chromaticAberrationPass);

	const filmGrainPass = new ShaderPass(FilmGrainShader);
	filmGrainPass.enabled = false;
	composer.addPass(filmGrainPass);

	const pixelRatio = renderer.getPixelRatio();
	const fxaaPass = new ShaderPass(FXAAShader);
	fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
	fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
	fxaaPass.enabled = false;
	composer.addPass(fxaaPass);

	const smaaPass = new SMAAPass(
		window.innerWidth * pixelRatio,
		window.innerHeight * pixelRatio
	);
	smaaPass.enabled = false;
	composer.addPass(smaaPass);

	const taaPass = new TAARenderPass(scene, camera);
	taaPass.enabled = false;
	taaPass.sampleLevel = 2;

	const outputPass = new OutputPass();
	composer.addPass(outputPass);

	return {
		composer,
		outlineEffect,
		bloomPass,
		fxaaPass,
		smaaPass,
		taaPass,
		chromaticAberrationPass,
		filmGrainPass,
		outlinePass,
		glitchPass,
		bleachBypassPass,
		colorCorrectionPass
	};
}

export function resizePostProcessing(
	refs: PostProcessingRefs,
	renderer: THREE.WebGLRenderer
) {
	const w = window.innerWidth;
	const h = window.innerHeight;
	const { composer, fxaaPass, bloomPass, smaaPass, outlinePass } = refs;
	composer.setSize(w, h);

	const pixelRatio = renderer.getPixelRatio();
	if (fxaaPass) {
		fxaaPass.material.uniforms['resolution'].value.x = 1 / (w * pixelRatio);
		fxaaPass.material.uniforms['resolution'].value.y = 1 / (h * pixelRatio);
	}
	if (bloomPass) {
		bloomPass.resolution.set(w, h);
	}
	if (smaaPass) {
		smaaPass.setSize(w * pixelRatio, h * pixelRatio);
	}
	if (outlinePass) {
		outlinePass.setSize(w, h);
	}
}
