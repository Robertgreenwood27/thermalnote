import { createApp } from '../server.mjs';
let app;
export default async function handler(req,res){
  try {
    app ||= createApp().catch(error=>{app=undefined;throw error;});
    return await (await app).handler(req,res);
  } catch(error) {
    console.error('Thermalnote initialization failed:',error.message);
    res.statusCode=503;
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify({error:'The notebook could not connect to its private storage. Please try again shortly.'}));
  }
}
