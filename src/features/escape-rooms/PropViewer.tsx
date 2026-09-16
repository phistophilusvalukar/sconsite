import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PublicNode } from './model';
import assetManifest from './assets.json';

function paperTexture(title: string, text: string) {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#e9d8b1'; ctx.fillRect(0, 0, 768, 1024);
  ctx.strokeStyle = '#99845f'; ctx.lineWidth = 3; ctx.strokeRect(30, 30, 708, 964);
  ctx.fillStyle = '#392c24'; ctx.font = 'bold 34px Georgia';
  const wrap = (value: string, top: number, lineHeight: number) => {
    let y = top;
    for (const paragraph of value.split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        if (ctx.measureText(`${line} ${word}`).width > 640 && line) { ctx.fillText(line, 64, y); y += lineHeight; line = ''; }
        line += `${line ? ' ' : ''}${word}`;
        if (y > 920) { ctx.fillText('… continued in the text panel', 64, 960); return y; }
      }
      ctx.fillText(line, 64, y); y += lineHeight;
    }
    return y;
  };
  const bottom = wrap(title, 95, 44);
  ctx.font = '28px Georgia'; wrap(text, bottom + 38, 42);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function PropViewer({ node }: { node: PublicNode }) {
  const host = useRef<HTMLDivElement>(null);
  const actions = useRef<{ rotate: () => void; reset: () => void; zoom: (factor: number) => void }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setFailed(true); return; }
    setFailed(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor('#111a20', 1);
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 2.4, 5.3);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.55, 0); controls.minDistance = 2.5; controls.maxDistance = 9; controls.enablePan = false;
    const light = new THREE.DirectionalLight('#ffe6ba', 4); light.position.set(3, 5, 4); scene.add(light);
    const rim = new THREE.DirectionalLight('#9fc7ed', 2); rim.position.set(-3, 2, -2); scene.add(rim);
    scene.add(new THREE.HemisphereLight('#d6e6ee', '#363025', 2));
    const prop = new THREE.Group(); prop.position.y = 0.6; scene.add(prop);
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const mat = (color: string, metalness = 0) => { const m = new THREE.MeshStandardMaterial({ color, metalness, roughness: metalness ? 0.3 : 0.8 }); materials.push(m); return m; };
    const brass = mat('#b99649', 0.8); const silver = mat('#b9c7cb', 0.85); const leather = mat('#603936'); const wood = mat('#513f30');
    const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent: THREE.Object3D = prop) => {
      const object = new THREE.Mesh(geo, material); object.position.set(...position); parent.add(object); return object;
    };
    const box = (size: [number, number, number], material: THREE.Material, position: [number, number, number]) => mesh(new THREE.BoxGeometry(...size), material, position);
    mesh(new THREE.CylinderGeometry(2.3, 2.4, 0.15, 64), mat('#293239'), [0, -0.25, 0], scene);
    switch (node.prop) {
      case 'key': {
        mesh(new THREE.TorusGeometry(0.38, 0.095, 16, 48), brass, [0, 0.65, 0]);
        mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 24), brass, [0, -0.15, 0]);
        box([0.4, 0.13, 0.16], brass, [0.16, -0.65, 0]); box([0.3, 0.13, 0.16], brass, [0.12, -0.38, 0]);
        prop.rotation.z = -0.5; break;
      }
      case 'rod':
        mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.3, 24), silver, [0, 0, 0]);
        mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 3), brass, [0, 1.1, 0]); prop.rotation.z = -0.85; break;
      case 'paper': case 'book': {
        if (node.prop === 'book') {
          box([1.65, 2.12, 0.1], leather, [0, 0, -0.15]);
          box([1.55, 2.02, 0.2], mat('#cbbb98'), [0, 0, 0]);
          box([0.13, 2.12, 0.36], leather, [-0.82, 0, 0]);
        } else box([1.52, 2.02, 0.025], mat('#e9d8b1'), [0, 0, 0]);
        for (const back of [false, true]) {
          const texture = paperTexture(back ? 'On the reverse' : node.title, back ? node.backText || 'No markings on this side.' : node.text);
          if (texture) textures.push(texture);
          const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }); materials.push(material);
          const page = mesh(new THREE.PlaneGeometry(1.5, 2), material, [0, 0, back ? -0.21 : 0.12]);
          if (back) page.rotation.y = Math.PI;
        }
        prop.rotation.x = -0.3; break;
      }
      case 'chest':
        box([1.8, 1, 1.1], wood, [0, 0, 0]); box([1.88, 0.17, 1.17], leather, [0, 0.56, 0]);
        for (const x of [-0.65, 0.65]) box([0.13, 1.16, 1.14], brass, [x, 0.04, 0]);
        box([0.25, 0.3, 0.12], brass, [0, 0.22, 0.6]); break;
      case 'door':
        box([1.4, 2.25, 0.18], wood, [0, 0.2, 0]);
        for (const x of [-0.78, 0.78]) box([0.18, 2.45, 0.3], mat('#667077'), [x, 0.2, 0]);
        box([1.75, 0.18, 0.3], silver, [0, 1.45, 0]); mesh(new THREE.SphereGeometry(0.09, 20, 20), brass, [0.48, 0.1, 0.2]); break;
      case 'crystal':
        mesh(new THREE.OctahedronGeometry(0.8), mat('#82bdc8', 0.4), [0, 0.3, 0]);
        mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.25, 8), brass, [0, -0.5, 0]); break;
    }
    const render = () => renderer.render(scene, camera);
    const resize = () => {
      camera.aspect = Math.max(element.clientWidth, 1) / 400; camera.updateProjectionMatrix();
      renderer.setSize(element.clientWidth, 400); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(element);
    controls.addEventListener('change', render); controls.update(); controls.saveState(); resize();
    actions.current = {
      rotate: () => { prop.rotation.y += Math.PI / 2; render(); },
      reset: () => { prop.rotation.y = 0; controls.reset(); render(); },
      zoom: factor => { camera.position.sub(controls.target).multiplyScalar(factor).clampLength(2.5, 9).add(controls.target); controls.update(); render(); },
    };
    const lost = (e: Event) => { e.preventDefault(); setFailed(true); };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      observer.disconnect(); controls.dispose(); actions.current = undefined;
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [node.prop, node.title, node.text, node.backText]);
  return <div className="er-prop-viewer" data-asset-id={assetManifest.assets[0].id}>
    {failed && <p role="status">3D is unavailable on this device. The complete handout is in the text panel below.</p>}
    <div ref={host} className="er-canvas" role="img" aria-label={`3D ${node.prop}: ${node.title}. The same information is provided as text below.`} style={failed ? { display: 'none' } : undefined} />
    {!failed && <><div className="er-viewer-controls"><button onClick={() => actions.current?.rotate()}>Rotate / reverse</button><button onClick={() => actions.current?.zoom(0.8)}>Zoom in</button><button onClick={() => actions.current?.zoom(1.25)}>Zoom out</button><button onClick={() => actions.current?.reset()}>Reset view</button></div><p className="er-hint">Drag to orbit · scroll to zoom · rotate to inspect the reverse</p></>}
  </div>;
}
