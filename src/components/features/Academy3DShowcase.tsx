import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Compass, Pause, Play, RotateCcw } from 'lucide-react';
import type { Course } from '../../types/lms';

interface Academy3DShowcaseProps {
  courses: Course[];
  onSelectDomain?: (domain: string) => void;
  heightClass?: string;
}

interface FacultyNodeConfig {
  id: string;
  label: string;
  domainMatch: string;
  angleRad: number;
  colorHex: number;
  accentCss: string;
  summary: string;
}

const FACULTY_NODES: FacultyNodeConfig[] = [
  {
    id: 'it-tech',
    label: 'IT & Technology',
    domainMatch: 'IT & Technology',
    angleRad: 0,
    colorHex: 0x38bdf8,
    accentCss: '#38BDF8',
    summary: 'AI Engineering, Prompt Engineering, AI Automation, Web & Graphic Design.',
  },
  {
    id: 'digital-media',
    label: 'Digital Marketing & Media',
    domainMatch: 'Digital Marketing',
    angleRad: (Math.PI * 2) / 5,
    colorHex: 0xa855f7,
    accentCss: '#A855F7',
    summary: 'Digital Marketing, Social Media, Content Creation, and Personal Branding.',
  },
  {
    id: 'business',
    label: 'Business & Management',
    domainMatch: 'Business',
    angleRad: (Math.PI * 4) / 5,
    colorHex: 0xf59e0b,
    accentCss: '#F59E0B',
    summary: 'Business Management, HRM, E-Commerce, and Entrepreneurship Pathways.',
  },
  {
    id: 'psychology',
    label: 'Psychology & Counseling',
    domainMatch: 'Psychology',
    angleRad: (Math.PI * 6) / 5,
    colorHex: 0x10b981,
    accentCss: '#10B981',
    summary: 'Applied Psychology, Counseling Skills, and Child & Educational Psychology.',
  },
  {
    id: 'arabic-islamic',
    label: 'Arabic & Islamic Studies',
    domainMatch: 'Arabic',
    angleRad: (Math.PI * 8) / 5,
    colorHex: 0xec4899,
    accentCss: '#EC4899',
    summary: 'Arabic Language, Tajweed, Islamic Jurisprudence, and Structured Studies.',
  },
];

type CameraPresetId = 'overview' | 'core' | 'constellation' | 'aerial';

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { label: 'Campus Overview', pos: [7.6, 5.1, 8.2], target: [0, 1.85, 0] },
  core: { label: 'AI Core Close-Up', pos: [3.4, 2.9, 3.6], target: [0, 2.35, 0] },
  constellation: { label: '40-Course Ring', pos: [0.2, 4.6, 9.6], target: [0, 2.4, 0] },
  aerial: { label: 'Architectural Plan', pos: [0.1, 11.4, 3.2], target: [0, 1.2, 0] },
};

// Pre-allocated scratch math objects (zero per-frame heap allocations)
const _dummy = new THREE.Object3D();
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

function createCourtyardTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0d182d';
    ctx.fillRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;

    // Subtle radial architectural pavement gradient
    const grad = ctx.createRadialGradient(cx, cy, 40, cx, cy, size * 0.48);
    grad.addColorStop(0, '#182b4d');
    grad.addColorStop(0.55, '#101d35');
    grad.addColorStop(1, '#091121');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Concentric calibration rings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 2;
    [130, 225, 330, 445].forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Radial spokes
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 130, cy + Math.sin(a) * 130);
      ctx.lineTo(cx + Math.cos(a) * 445, cy + Math.sin(a) * 445);
      ctx.stroke();
    }

    // Crisp central ring typography
    ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TECHMAN AI INSTITUTE · 2027 PAVILION', cx, cy + 382);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.08,
      size / 2,
      size / 2,
      size * 0.5
    );
    grad.addColorStop(0, 'rgba(2, 6, 23, 0.62)');
    grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.28)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const Academy3DShowcase: React.FC<Academy3DShowcaseProps> = ({
  courses,
  onSelectDomain,
  heightClass = 'h-[520px] sm:h-[580px]',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [activePreset, setActivePreset] = useState<CameraPresetId>('overview');
  const [selectedFacultyId, setSelectedFacultyId] = useState<string | null>(null);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [hudExpanded, setHudExpanded] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Refs bridging React controls into the animation loop cleanly
  const cameraGoalRef = useRef<{
    pos: [number, number, number];
    target: [number, number, number];
    active: boolean;
  }>({
    pos: CAMERA_PRESETS.overview.pos,
    target: CAMERA_PRESETS.overview.target,
    active: false,
  });
  const autoOrbitRef = useRef(true);
  const selectedFacultyRef = useRef<string | null>(null);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    selectedFacultyRef.current = selectedFacultyId;
  }, [selectedFacultyId]);

  const focusPreset = (presetId: CameraPresetId) => {
    setActivePreset(presetId);
    setSelectedFacultyId(null);
    const p = CAMERA_PRESETS[presetId];
    cameraGoalRef.current = { pos: [...p.pos], target: [...p.target], active: true };
  };

  const focusFaculty = (node: FacultyNodeConfig) => {
    setSelectedFacultyId(node.id);
    const radius = 3.1;
    const nx = Math.cos(node.angleRad) * radius;
    const nz = Math.sin(node.angleRad) * radius;
    const camRadius = 6.2;
    const cx = Math.cos(node.angleRad + 0.32) * camRadius;
    const cz = Math.sin(node.angleRad + 0.32) * camRadius;
    cameraGoalRef.current = {
      pos: [cx, 3.2, cz],
      target: [nx, 1.35, nz],
      active: true,
    };
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglError('WebGL rendering is unavailable in this browser context.');
      return;
    }

    // Detect software WebGL rasterizers (SwiftShader / llvmpipe) to adapt quality & pacing
    let isSoftwareGl = false;
    try {
      const gl = renderer.getContext();
      const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = debugExt
        ? String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || '')
        : '';
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererName);
    } catch {
      isSoftwareGl = false;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x091121);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0x091121, 0.038);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.minDistance = 3.2;
    controls.maxDistance = 16.5;
    controls.maxPolarAngle = Math.PI * 0.475;
    controls.minPolarAngle = 0.22;

    // Cancel camera preset flight immediately when user manually drags/zooms
    const handleControlStart = () => {
      cameraGoalRef.current.active = false;
    };
    controls.addEventListener('start', handleControlStart);

    // Environment reflections via RoomEnvironment + PMREMGenerator
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    // Lighting rig: warm key light + cool sky/ground hemisphere + rim accent
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.15);
    keyLight.position.set(7.5, 11.5, 6.5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 26;
      keyLight.shadow.camera.left = -7.5;
      keyLight.shadow.camera.right = 7.5;
      keyLight.shadow.camera.top = 7.5;
      keyLight.shadow.camera.bottom = -7.5;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
    rimLight.position.set(-7.5, 5.0, -6.0);
    scene.add(rimLight);

    // Ground courtyard disc with procedural CanvasTexture
    const courtyardTex = createCourtyardTexture();
    courtyardTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floorGeo = new THREE.CylinderGeometry(8.6, 8.8, 0.16, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      map: courtyardTex,
      roughness: 0.72,
      metalness: 0.18,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.08;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Soft radial contact shadow grounded right above the floor
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(5.6, 5.6);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.005;
    scene.add(contactShadow);

    // Composite Multi-Part Hero Monument Group (bottom-center grounded at y = 0)
    const monumentGroup = new THREE.Group();
    scene.add(monumentGroup);

    // Part 1: Stepped beveled octagonal basalt plinth
    const octShape = new THREE.Shape();
    const octSides = 8;
    const octR = 1.95;
    for (let i = 0; i < octSides; i++) {
      const a = (i / octSides) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * octR;
      const y = Math.sin(a) * octR;
      if (i === 0) octShape.moveTo(x, y);
      else octShape.lineTo(x, y);
    }
    octShape.closePath();

    const plinthGeo = new THREE.ExtrudeGeometry(octShape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06,
    });
    plinthGeo.rotateX(-Math.PI / 2);
    const basaltMat = new THREE.MeshStandardMaterial({
      color: 0x162238,
      roughness: 0.52,
      metalness: 0.35,
    });
    const plinthMesh = new THREE.Mesh(plinthGeo, basaltMat);
    plinthMesh.position.y = 0.06;
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    monumentGroup.add(plinthMesh);

    // Part 2: Upper titanium stage & luminous cyan trim collar
    const upperStageGeo = new THREE.CylinderGeometry(1.38, 1.56, 0.24, 32);
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.32,
      metalness: 0.78,
    });
    const upperStage = new THREE.Mesh(upperStageGeo, titaniumMat);
    upperStage.position.y = 0.56;
    upperStage.castShadow = true;
    upperStage.receiveShadow = true;
    monumentGroup.add(upperStage);

    const trimRingGeo = new THREE.TorusGeometry(1.46, 0.028, 16, 64);
    const cyanGlowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.4,
    });
    const trimRing = new THREE.Mesh(trimRingGeo, cyanGlowMat);
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.y = 0.68;
    monumentGroup.add(trimRing);

    // Part 3: Four tapered architectural structural pylons
    const pylonGeo = new THREE.BoxGeometry(0.14, 1.9, 0.28);
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.36,
      metalness: 0.72,
    });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(Math.cos(angle) * 1.18, 1.56, Math.sin(angle) * 1.18);
      pylon.rotation.y = -angle;
      pylon.rotation.z = 0.14;
      pylon.castShadow = true;
      monumentGroup.add(pylon);
    }

    // Part 4: Floating Holographic AI Core (faceted crystal + glowing heart + 3 gyroscopic rings)
    const coreGroup = new THREE.Group();
    coreGroup.position.y = 2.45;
    monumentGroup.add(coreGroup);

    const outerCrystalGeo = new THREE.IcosahedronGeometry(0.72, 0);
    const outerCrystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x1677ff,
      roughness: 0.12,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.84,
    });
    const outerCrystal = new THREE.Mesh(outerCrystalGeo, outerCrystalMat);
    outerCrystal.castShadow = true;
    coreGroup.add(outerCrystal);

    const innerHeartGeo = new THREE.OctahedronGeometry(0.36, 0);
    const innerHeartMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 2.2,
      roughness: 0.18,
      metalness: 0.2,
    });
    const innerHeart = new THREE.Mesh(innerHeartGeo, innerHeartMat);
    coreGroup.add(innerHeart);

    const ringAMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.22,
      metalness: 0.88,
    });
    const ringBMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0369a1,
      emissiveIntensity: 0.9,
      roughness: 0.28,
      metalness: 0.72,
    });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.032, 18, 72), ringAMat);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.024, 16, 72), ringBMat);
    const ringC = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.018, 16, 72), ringAMat);
    ringA.rotation.x = 0.75;
    ringB.rotation.y = 1.05;
    ringC.rotation.x = -0.45;
    coreGroup.add(ringA, ringB, ringC);

    // Part 5: Five Interactive Faculty Pavilion Beacons around perimeter
    const facultyPickables: THREE.Mesh[] = [];
    const facultyOrbs: Array<{
      id: string;
      orb: THREE.Mesh;
      baseY: number;
      phase: number;
    }> = [];

    const pedestalGeo = new THREE.CylinderGeometry(0.34, 0.44, 0.62, 16);
    const orbGeo = new THREE.DodecahedronGeometry(0.28, 0);

    FACULTY_NODES.forEach((node, idx) => {
      const r = 3.25;
      const x = Math.cos(node.angleRad) * r;
      const z = Math.sin(node.angleRad) * r;

      const ped = new THREE.Mesh(pedestalGeo, basaltMat);
      ped.position.set(x, 0.31, z);
      ped.castShadow = true;
      ped.receiveShadow = true;
      monumentGroup.add(ped);

      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.36, 0.02, 12, 32),
        new THREE.MeshStandardMaterial({
          color: node.colorHex,
          emissive: node.colorHex,
          emissiveIntensity: 1.1,
          roughness: 0.25,
          metalness: 0.5,
        })
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.set(x, 0.62, z);
      monumentGroup.add(collar);

      const orbMat = new THREE.MeshPhysicalMaterial({
        color: node.colorHex,
        emissive: node.colorHex,
        emissiveIntensity: 0.45,
        roughness: 0.18,
        metalness: 0.3,
        clearcoat: 0.9,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(x, 1.24, z);
      orb.castShadow = true;
      orb.userData = { facultyId: node.id };
      monumentGroup.add(orb);

      facultyPickables.push(orb);
      facultyOrbs.push({ id: node.id, orb, baseY: 1.24, phase: idx * 1.25 });
    });

    // Part 6: InstancedMesh 40-Course Orbital Constellation (40 nodes = 40 unique 2027 courses)
    const COURSE_COUNT = 40;
    const nodeGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.24,
      metalness: 0.65,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.35,
    });
    const constellationMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, COURSE_COUNT);
    const paletteColors = [
      new THREE.Color(0x38bdf8),
      new THREE.Color(0xa855f7),
      new THREE.Color(0xf59e0b),
      new THREE.Color(0x10b981),
      new THREE.Color(0xec4899),
    ];
    for (let i = 0; i < COURSE_COUNT; i++) {
      constellationMesh.setColorAt(i, paletteColors[i % paletteColors.length]);
    }
    if (constellationMesh.instanceColor) {
      constellationMesh.instanceColor.needsUpdate = true;
    }
    scene.add(constellationMesh);

    // Click picking for the 5 Faculty Beacons
    const handlePointerUp = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(facultyPickables, false);
      if (hits.length > 0) {
        const facultyId = hits[0].object.userData?.facultyId as string | undefined;
        const found = FACULTY_NODES.find((n) => n.id === facultyId);
        if (found) {
          focusFaculty(found);
        }
      }
    };
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    // Coalesced ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(1, Math.floor(entry.contentRect.width));
      const h = Math.max(1, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(container);
    renderer.setSize(width, height, false);

    // Animation loop with software WebGL pacing via afterDraw
    let disposed = false;
    let rafId = 0;
    let lastTime = performance.now();
    let elapsed = 0;

    const scheduleNext = (cb: () => void) => {
      if (disposed) return;
      if (isSoftwareGl) {
        rafId = window.requestAnimationFrame(() => {
          rafId = window.requestAnimationFrame(cb);
        });
      } else {
        rafId = window.requestAnimationFrame(cb);
      }
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      elapsed += dt;

      // Subtle holographic core & gyroscopic motion
      coreGroup.position.y = 2.45 + Math.sin(elapsed * 1.45) * 0.09;
      outerCrystal.rotation.y += dt * 0.42;
      outerCrystal.rotation.x = Math.sin(elapsed * 0.6) * 0.18;
      innerHeart.rotation.y -= dt * 0.9;
      ringA.rotation.z += dt * 0.55;
      ringB.rotation.x -= dt * 0.38;
      ringC.rotation.y += dt * 0.32;

      // Animate 5 Faculty Orbs
      for (let i = 0; i < facultyOrbs.length; i++) {
        const item = facultyOrbs[i];
        const isPicked = selectedFacultyRef.current === item.id;
        item.orb.position.y = item.baseY + Math.sin(elapsed * 1.8 + item.phase) * 0.08;
        item.orb.rotation.y += dt * (isPicked ? 1.5 : 0.65);
        const targetScale = isPicked ? 1.32 : 1.0;
        const s = THREE.MathUtils.damp(item.orb.scale.x, targetScale, 8, dt);
        item.orb.scale.setScalar(s);
      }

      // Animate 40-Course InstancedMesh Orbital Constellation
      for (let i = 0; i < COURSE_COUNT; i++) {
        const ringBand = i % 2 === 0 ? 4.35 : 5.05;
        const baseAngle = (i / COURSE_COUNT) * Math.PI * 2;
        const speed = i % 2 === 0 ? 0.14 : -0.1;
        const angle = baseAngle + elapsed * speed;
        const y = (i % 2 === 0 ? 2.55 : 3.25) + Math.sin(elapsed * 1.3 + i * 0.5) * 0.18;
        _dummy.position.set(Math.cos(angle) * ringBand, y, Math.sin(angle) * ringBand);
        _dummy.rotation.set(elapsed * 0.6 + i, elapsed * 0.8 + i * 0.3, 0);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        constellationMesh.setMatrixAt(i, _dummy.matrix);
      }
      constellationMesh.instanceMatrix.needsUpdate = true;

      // Smooth damped camera preset transitions
      if (cameraGoalRef.current.active) {
        _targetPos.set(...cameraGoalRef.current.pos);
        _targetLook.set(...cameraGoalRef.current.target);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetPos.x, 5.2, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetPos.y, 5.2, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetPos.z, 5.2, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLook.x, 5.5, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLook.y, 5.5, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLook.z, 5.5, dt);
        if (
          camera.position.distanceTo(_targetPos) < 0.04 &&
          controls.target.distanceTo(_targetLook) < 0.04
        ) {
          cameraGoalRef.current.active = false;
        }
      } else if (autoOrbitRef.current) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.65;
      } else {
        controls.autoRotate = false;
      }

      controls.update();
      renderer.render(scene, camera);
      scheduleNext(tick);
    };

    scheduleNext(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlStart);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      envTarget.dispose();
      courtyardTex.dispose();
      shadowTex.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.dispose();
        }
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          mat.dispose();
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const selectedFaculty = FACULTY_NODES.find((f) => f.id === selectedFacultyId) || null;
  const selectedFacultyCourseCount = selectedFaculty
    ? courses.filter((c) =>
        `${c.domain} ${c.name}`.toLowerCase().includes(selectedFaculty.domainMatch.toLowerCase())
      ).length
    : 0;

  return (
    <div className="rounded-3xl overflow-hidden border border-slate-800 bg-[#091121] shadow-xl relative">
      {/* Full-Bleed WebGL Canvas Stage */}
      <div className={`relative w-full ${heightClass}`}>
        {webglError ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-slate-300">
            <Compass className="w-10 h-10 text-sky-400 mb-3" />
            <div className="text-sm font-bold text-white">3D Showcase Requires WebGL</div>
            <p className="text-xs text-slate-400 mt-1 max-w-md">{webglError}</p>
          </div>
        ) : (
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
        )}

        {/* Minimal Top-Left Title Badge (solid surface, zero backdrop-filter over WebGL) */}
        <div className="pointer-events-none absolute top-4 left-4 bg-[#0B1528]/95 border border-slate-700/80 rounded-xl px-3.5 py-2 text-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-400">
            Interactive 3D Pavilion · WebGL
          </div>
          <div className="text-xs sm:text-sm font-extrabold">
            TECHMAN AI 2027 · {courses.length || 40} Courses · 5 Faculties
          </div>
        </div>

        {/* Collapsible Bottom HUD Dock (solid surface, no backdrop-filter, no side occlusions) */}
        <div className="absolute bottom-3 left-3 right-3 z-10 flex justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-4xl rounded-2xl bg-[#0B1528]/95 border border-slate-700/90 text-slate-100 shadow-2xl overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 truncate">
                {selectedFaculty ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: selectedFaculty.accentCss }}
                    />
                    <span className="font-bold text-white">{selectedFaculty.label}</span>
                    <span className="text-slate-400 hidden sm:inline">
                      · {selectedFacultyCourseCount} courses · {selectedFaculty.summary}
                    </span>
                  </>
                ) : (
                  <span>Drag to orbit · Scroll to zoom · Click any glowing faculty beacon</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {selectedFaculty && onSelectDomain && (
                  <button
                    type="button"
                    onClick={() => onSelectDomain(selectedFaculty.domainMatch)}
                    className="px-2.5 py-1 rounded-lg bg-[#1677FF] hover:bg-blue-600 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Browse Courses
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAutoOrbit((v) => !v)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  title={autoOrbit ? 'Pause auto-orbit' : 'Resume auto-orbit'}
                >
                  {autoOrbit ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => focusPreset('overview')}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  title="Reset camera view"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setHudExpanded((v) => !v)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  title={hudExpanded ? 'Collapse controls' : 'Expand controls'}
                >
                  {hudExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {hudExpanded && (
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Camera Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((presetKey) => (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => focusPreset(presetKey)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        activePreset === presetKey && !selectedFacultyId
                          ? 'bg-[#1677FF] text-white'
                          : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {CAMERA_PRESETS[presetKey].label}
                    </button>
                  ))}
                </div>

                {/* 5 Faculty Spotlight Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {FACULTY_NODES.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => focusFaculty(node)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        selectedFacultyId === node.id
                          ? 'bg-slate-700 text-white ring-1 ring-sky-400'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: node.accentCss }}
                      />
                      {node.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
