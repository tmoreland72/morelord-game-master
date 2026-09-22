import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCompanion,validateUpload,responseBody } from "../companion/server.mjs";

test("authenticated campaign library persists, isolates contexts, handles files, and survives API failures",async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(),"mlgm-test-"));
  const calls = []; let fail = false;
  const {server,token} = createCompanion({directory,apiKey:"test-key",model:"test-model",fetchImpl:async (url,options) => {
    calls.push(JSON.parse(options.body));
    return fail ? new Response("failure",{status:429}) : Response.json({status:"completed",output:[{content:[{type:"output_text",text:"The tower is north. [notes.md]"}]}]});
  }});
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url,method="GET",body) => fetch(base+url,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:body === undefined ? undefined : JSON.stringify(body)});
  try {
    assert.equal((await fetch(base+"/campaigns")).status,401);
    assert.equal((await fetch(base+"/campaigns",{headers:{Origin:"https://evil.example",Authorization:`Bearer ${token}`}})).status,403);
    const c = await (await request("/campaigns","POST",{name:"North",notes:"North secret",rules:"2024"})).json();
    const other = await (await request("/campaigns","POST",{name:"South",notes:"South secret",rules:"2014"})).json();
    const route = `/campaigns/${c.id}`;
    const upload = await request(route+"/files","POST",{name:"notes.md",data:Buffer.from("Tower is north").toString("base64")});
    assert.equal(upload.status,201);
    const file = (await upload.json()).files[0]; assert.equal(file.data,undefined);
    assert.equal((await request(route+"/files","POST",{name:"notes.md",data:Buffer.from("duplicate").toString("base64")})).status,400);
    const chatted = await (await request(route+"/chat","POST",{prompt:"Where is the tower?"})).json();
    assert.equal(chatted.messages.length,2); assert.match(JSON.stringify(calls[0]),/North secret/); assert.doesNotMatch(JSON.stringify(calls[0]),/South secret/);
    assert.equal((await (await request(`/campaigns/${other.id}`)).json()).messages.length,0);
    fail = true; assert.equal((await request(route+"/chat","POST",{prompt:"Again"})).status,502);
    assert.equal((await (await request(route)).json()).messages.length,2);
    assert.equal((await request(route+`/files/${file.id}`,"DELETE")).status,200);
    assert.equal((await (await request(route)).json()).files.length,0);
    assert.equal((await request("/campaigns/not-an-id")).status,400);
    const reloaded = createCompanion({directory});
    await new Promise(resolve => reloaded.server.listen(0,"127.0.0.1",resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${reloaded.server.address().port}${route}`,{headers:{Authorization:`Bearer ${reloaded.token}`}});
      assert.equal((await response.json()).messages.length,2);
    } finally { await new Promise(resolve => reloaded.server.close(resolve)); }
  } finally { await new Promise(resolve => server.close(resolve)); await rm(directory,{recursive:true,force:true}); }
});
test("uploads reject invalid files and PDFs use the documented input shape",() => {
  assert.throws(() => validateUpload({name:"fake.pdf",data:Buffer.from("not PDF").toString("base64")}));
  assert.throws(() => validateUpload({name:"script.exe",data:"YQ=="}));
  const file = validateUpload({name:"book.pdf",data:Buffer.from("%PDF-1.7\n").toString("base64")});
  const body = responseBody({name:"Test",rules:"2024",notes:"",files:[file],messages:[]},"question",{},"model");
  assert.equal(body.store,false); assert.equal(body.input[0].content[0].type,"input_file");
  assert.match(body.input[0].content[0].file_data,/^data:application\/pdf;base64,/);
});
