const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map(),events={};const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',style:{},value:'',showModal(){},close(){}});return nodes.get(s)};
const context=vm.createContext({document:{querySelector:node,addEventListener:(t,cb)=>events[t]=cb},localStorage:{getItem:()=>null,setItem(){}},location:{hash:''},window:{addEventListener(){}},setTimeout(){},clearTimeout(){},console});
vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
assert.match(node('#content').innerHTML,/Revenue overview/);
for(const route of ['reservations','rooms','pos','payments','finance','people','inventory','compliance','messages','reports']){context.location.hash='#'+route;vm.runInContext('render()',context);assert.ok(node('#content').innerHTML.length>200,route)}
vm.runInContext("tab='arrivals';query='';",context);assert.equal(vm.runInContext('filtered().length',context),3);
events.click({target:{closest:()=>({dataset:{check:'RES-2041'}})}});assert.equal(vm.runInContext("state.bookings[0].status",context),'In house');
events.click({target:{closest:()=>({dataset:{check:'RES-2041'}})}});assert.equal(vm.runInContext("state.bookings[0].status",context),'Checked out');
events.click({target:{closest:()=>({dataset:{clean:'88'}})}});assert.equal(vm.runInContext('roomStatus(88)',context),'Available');
vm.runInContext("tab='all';query='sarah'",context);assert.equal(vm.runInContext('filtered().length',context),1);
assert.equal(vm.runInContext("esc('<script>')",context),'&lt;script&gt;');console.log('PASS: 11 routes, arrival filtering, guest search, check-in/out, housekeeping and HTML escaping.');
