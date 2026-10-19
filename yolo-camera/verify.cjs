// Run from the repository root: node yolo-camera/verify.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const ort=require('./vendor/ort.min.js');
const {decode}=require('./detection.js');
const config=require('./model.json');
(async()=>{
  const geometry={width:640,height:480,padX:0,padY:80,scaleX:1,scaleY:1};
  // Two overlapping same-class boxes are suppressed; another class survives.
  const boxes=decode(new Float32Array([100,100,40,40,.9,.1,101,101,40,40,.8,.1,100,100,40,40,.1,.85]),[1,3,6],['a','b'],.4,geometry,'cxcywh');
  assert.equal(boxes.length,2);assert.equal(boxes[0].y1,0);
  const corners=decode(new Float32Array([100,100,140,140,.9]),[1,1,5],['a'],.4,geometry,'xyxy');
  assert.equal(corners[0].x1,100);assert.equal(corners[0].y1,20);assert.equal(corners[0].x2,140);
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=pathToFileURL(path.resolve(__dirname,'vendor')+path.sep).href;
  const session=await ort.InferenceSession.create(fs.readFileSync(path.join(__dirname,'models/yolov9-t.onnx')),{executionProviders:['wasm']});
  const hasSample=fs.existsSync('tmp/yolo-input.bin');
  // Buffer copies avoid pooled-buffer offsets when using the optional image fixture.
  const input=hasSample?new Float32Array(Uint8Array.from(fs.readFileSync('tmp/yolo-input.bin')).buffer):new Float32Array(3*640*640);
  const tensor=new ort.Tensor('float32',input,[1,3,640,640]);
  const result=await session.run({[session.inputNames[0]]:tensor});
  const out=result[session.outputNames[0]];
  assert.deepEqual(out.dims,[1,84,8400]);
  const actual=decode(out.data,out.dims,config.classes,.4,hasSample?JSON.parse(fs.readFileSync('tmp/yolo-geometry.json')):{...geometry,height:640,padY:0});
  if(hasSample){
    assert(actual.some(b=>b.label==='bus'));assert(actual.some(b=>b.label==='person'));
    const bus=actual.find(b=>b.label==='bus');assert(bus.y1>150&&bus.y1<300);assert(bus.x2>700);
  }
  console.log(JSON.stringify({shape:out.dims,detections:actual},null,2));
  tensor.dispose();Object.values(result).forEach(v=>v.dispose());await session.release();
})().catch(e=>{console.error(e);process.exitCode=1;});
