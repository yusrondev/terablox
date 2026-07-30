const THREE = require('three');
const CANNON = require('cannon-es');

function testRuko() {
  const type = 'ruko';
  const bColorStr = '#ffb7b2';
  const bColor = new THREE.Color(bColorStr);
  const bMat = new THREE.MeshLambertMaterial({ color: bColor });
  const g = new THREE.Group();
  
  const w = 7;
  const d = 8;
  const h = 8;
  
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMat);
  base.position.y = h / 2;
  
  const awningMat = new THREE.MeshLambertMaterial({ color: 0x2980b9 });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 3), awningMat);
  awning.rotation.x = 0.1;
  awning.position.set(0, 3.5, d/2 + 1.5);
  
  const glassGeo = new THREE.BoxGeometry(w - 1, 3, 0.1);
  const winMat = new THREE.MeshBasicMaterial({ color: 0x25303b });
  const glass = new THREE.Mesh(glassGeo, winMat);
  glass.position.set(0, 1.5, d/2 + 0.05);
  
  const win2Geo = new THREE.BoxGeometry(2, 2, 0.1);
  const win2a = new THREE.Mesh(win2Geo, winMat); win2a.position.set(-1.5, 6, d/2 + 0.05);
  const win2b = new THREE.Mesh(win2Geo, winMat); win2b.position.set(1.5, 6, d/2 + 0.05);
  
  g.add(base, awning, glass, win2a, win2b);
  
  console.log("Ruko created with children:", g.children.length);
}
testRuko();
