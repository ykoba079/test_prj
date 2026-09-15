const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8'),scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
for(const [,attrs,code] of scripts)new vm.Script(code);
let messages=[];const context=vm.createContext({performance,postMessage:m=>messages.push(structuredClone(m))});
vm.runInContext(scripts.find(s=>s[1].includes('worker-source'))[2],context);
async function send(data){messages=[];await context.onmessage({data});assert.equal(messages.some(m=>m.type==='error'),false,JSON.stringify(messages));return messages;}
(async()=>{const ALL=4294967295;
let m=(await send({type:'load',csv:fs.readFileSync(__dirname+'/sample.csv','utf8')}))[0];assert.equal(m.meta.n,5);assert.equal(m.meta.gpuSafe,true);
let c=(await send({type:'cpu',f:[ALL,ALL,ALL,ALL,0]}))[0];assert.deepEqual(c.result,[2,300,50,0,0,0,0,0,0,1,150,40]);
const summary=(await send({type:'cpu',f:[ALL,ALL,ALL,ALL,1]}))[0];for(let i=0;i<c.result.length;i++)if(i%3!==0)assert.equal(c.result[i],summary.result[i]);
assert.deepEqual((await send({type:'cpu',f:[0,0,2024,0,0]}))[0].result,[1,100,20,0,0,0,0,0,0,0,0,0]);
m=(await send({type:'load',csv:'\uFEFF都道府県,市町村,年,データ値1,データ値2,タグ,行種別\r\n東京都,"区,名",2024,10,20,"タグ""引用\n改行",明細\r\n'}))[0];assert.equal(m.meta.tag[0],'タグ"引用\n改行');
messages=[];await context.onmessage({data:{type:'load',csv:'都道府県,市町村,年,データ値1,データ値2,タグ,行種別\n東京,区,2024,-1,2,タグ,明細'}});assert.equal(messages[0].type,'error');
// Reuse the existing dataset: validation never regenerates a million rows.
m=(await send({type:'load',csv:fs.readFileSync(__dirname+'/sample-million.csv','utf8')}))[0];assert.equal(m.meta.detail,1000000);assert.equal(m.meta.summary,108);assert.equal(m.meta.gpuSafe,true);
const detail=(await send({type:'cpu',f:[ALL,ALL,ALL,ALL,0]}))[0],s=(await send({type:'cpu',f:[ALL,ALL,ALL,ALL,1]}))[0];for(let i=0;i<detail.result.length;i++)if(i%3!==0)assert.equal(detail.result[i],s.result[i]);
const rows=new Uint32Array(m.buffer),groups=m.meta.pref.length*m.meta.tag.length,shards=new Uint32Array(256*groups*3);
for(let i=0;i<m.meta.n;i++){const j=i*7;if(rows[j+6])continue;const k=((i%256)*groups+rows[j]*m.meta.tag.length+rows[j+5])*3;shards[k]++;shards[k+1]+=rows[j+3];shards[k+2]+=rows[j+4];}
const result=Array(groups*3).fill(0);for(let i=0;i<shards.length;i++)result[i%result.length]+=shards[i];assert.deepEqual(result,detail.result);
assert.deepEqual(result.reduce((a,v,i)=>(a[i%3]+=v,a),[0,0,0]),[1000000,499695088,249463931]);
for(const f of [[0,ALL,2024,ALL,0],[0,0,ALL,ALL,0],[ALL,ALL,ALL,1,0]]){const expected=Array(groups*3).fill(0);for(let i=0;i<m.meta.n;i++){const j=i*7;if((f[0]!==ALL&&rows[j]!==f[0])||(f[1]!==ALL&&rows[j+1]!==f[1])||(f[2]!==ALL&&rows[j+2]!==f[2])||(f[3]!==ALL&&rows[j+5]!==f[3])||rows[j+6]!==f[4])continue;const k=(rows[j]*m.meta.tag.length+rows[j+5])*3;expected[k]++;expected[k+1]+=rows[j+3];expected[k+2]+=rows[j+4];}assert.deepEqual((await send({type:'cpu',f}))[0].result,expected);}
const main=scripts.find(s=>!s[1].includes('worker-source'))[2];const utils=vm.createContext({});vm.runInContext(main.slice(main.indexOf('function median('),main.indexOf('async function run(')),utils);assert.equal(utils.median([5,1,4,2,3]),3);assert.equal(utils.equal([1,2],[1,3]),false);
const geo=JSON.parse(fs.readFileSync(__dirname+'/japan.geojson','utf8'));assert.equal(geo.features.length,47);assert.equal(new Set(geo.features.map(f=>f.properties.id)).size,47);const mapUtils=vm.createContext({});vm.runInContext(main.slice(main.indexOf('function projectMap('),main.indexOf('function drawMap(')),mapUtils);for(const feature of geo.features){const path=mapUtils.mapPath(feature);assert.ok(path.startsWith('M')&&path.endsWith('Z'));assert.ok(!/NaN|Infinity/.test(path));const bounds=mapUtils.regionView(feature).split(' ').map(Number);assert.ok(bounds.every(Number.isFinite)&&bounds[2]>0&&bounds[3]>0);for(const poly of feature.geometry.coordinates)for(const ring of poly){assert.ok(ring.length>=4);assert.deepEqual(ring[0],ring.at(-1));}}
const navigationUtils=vm.createContext({});vm.runInContext(main.slice(main.indexOf('function zoomCamera('),main.indexOf('function bindMapNavigation(')),navigationUtils);const base=[0,0,500,540],anchor=[100,200];const zoomed=navigationUtils.zoomCamera(base,base,anchor,.5);assert.equal(zoomed[2],250);assert.equal(zoomed[3],270);assert.equal((anchor[0]-zoomed[0])/zoomed[2],.2);assert.equal((anchor[1]-zoomed[1])/zoomed[3],200/540);assert.equal(navigationUtils.zoomCamera(base,base,anchor,.0001)[2],12.5);assert.equal(navigationUtils.zoomCamera(base,base,anchor,100)[2],500);assert.deepEqual(Array.from(navigationUtils.panCamera(base,20,-30)),[-20,30,500,540]);assert.equal(navigationUtils.barPercent(200,200),100);assert.equal(navigationUtils.barPercent(100,200),50);assert.equal(navigationUtils.barPercent(0,0),0);assert.equal(navigationUtils.barPercent(300,200),100);
console.log('PASS: JS syntax, CSV parser, region/city/year/tag filters, existing 1M totals, region-tag shard bins, summaries, median, map zoom anchor/limits/pan, common chart scale. No dataset generated.');
})().catch(e=>{console.error(e);process.exitCode=1;});
