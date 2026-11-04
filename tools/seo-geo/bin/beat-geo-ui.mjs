#!/usr/bin/env node
import { startWorkbench } from '../src/workbench.mjs';
const port=process.env.BEAT_GEO_UI_PORT===undefined?4317:Number(process.env.BEAT_GEO_UI_PORT);
const app=await startWorkbench({port});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
