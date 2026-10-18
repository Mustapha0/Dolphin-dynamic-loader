const express=require('express'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os'),{spawn}=require('child_process'),multer=require('multer'),unzipper=require('unzipper');
const app=express(),PORT=Number(process.env.PORT||8080),TOKEN=process.env.BUILD_TOKEN||'',ROOT=__dirname,JOBS=path.join(ROOT,'jobs'),TEMPLATE=path.join(ROOT,'template');
if(!TOKEN){console.error('BUILD_TOKEN is required');process.exit(1)}fs.mkdirSync(JOBS,{recursive:true});app.disable('x-powered-by');
// Bearer-token API used by Android WebView (whose Origin may be null) and web clients.
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next()});
app.use((req,res,next)=>{if(req.path==='/health')return next();const h=req.headers.authorization||'',sup=h.startsWith('Bearer ')?h.slice(7):'';const a=crypto.createHash('sha256').update(sup).digest(),b=crypto.createHash('sha256').update(TOKEN).digest();if(!sup||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'Unauthorized'});next()});
const upload=multer({dest:path.join(os.tmpdir(),'dolphin-upload'),limits:{fileSize:50*1024*1024,files:1}});const jobs=new Map();
function run(cmd,args,cwd,timeout=600000,jobId=null){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{cwd,env:{PATH:process.env.PATH,HOME:process.env.HOME||'/tmp',CI:'1',ANDROID_HOME:process.env.ANDROID_HOME,ANDROID_SDK_ROOT:process.env.ANDROID_SDK_ROOT,GRADLE_USER_HOME:process.env.GRADLE_USER_HOME||path.join(os.homedir(),'.gradle'),npm_config_audit:'false',npm_config_fund:'false'},stdio:['ignore','pipe','pipe']});let out='';let pending='';const add=d=>{const chunk=d.toString();out+=chunk;if(out.length>20000)out=out.slice(-20000);pending+=chunk;const lines=pending.split(/\r?\n/);pending=lines.pop()||'';const useful=lines.map(x=>x.replace(/\x1b\[[0-9;]*m/g,'').trim()).filter(Boolean).slice(-3);if(jobId&&useful.length){const j=jobs.get(jobId);if(j){j.log=useful.slice(-3);j.message=(j.stageLabel||j.message)+' — '+useful[useful.length-1].slice(0,220);j.updatedAt=Date.now();jobs.set(jobId,j)}}};p.stdout.on('data',add);p.stderr.on('data',add);const t=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Command timed out: '+cmd+'\n'+out.slice(-5000)))},timeout);p.on('error',e=>{clearTimeout(t);reject(e)});p.on('close',c=>{clearTimeout(t);c===0?resolve(out):reject(Error(cmd+' failed ('+c+')\n'+out.slice(-8000)))})})}
async function extractSafe(zip,dest){await new Promise((resolve,reject)=>{const parser=unzipper.Parse();const writes=[];let count=0,total=0,failed=false;const fail=e=>{if(!failed){failed=true;reject(e)}};fs.createReadStream(zip).pipe(parser);parser.on('entry',e=>{const name=e.path.replace(/\\/g,'/');if(name.startsWith('/')||name.split('/').includes('..')||name.includes('\0')||e.type==='SymbolicLink'){e.autodrain();return fail(Error('Unsafe ZIP entry'))}if(++count>5000){e.autodrain();return fail(Error('ZIP contains too many files'))}if(e.type==='Directory'){e.autodrain();return}total+=Number(e.vars.uncompressedSize||0);if(total>300*1024*1024){e.autodrain();return fail(Error('Uncompressed project exceeds 300 MB'))}const out=path.resolve(dest,name);if(!out.startsWith(path.resolve(dest)+path.sep)){e.autodrain();return fail(Error('Unsafe path'))}fs.mkdirSync(path.dirname(out),{recursive:true});const w=fs.createWriteStream(out,{flags:'wx'});writes.push(new Promise((r,j)=>{w.on('finish',r);w.on('error',j)}));e.pipe(w)});parser.on('close',()=>Promise.all(writes).then(()=>failed||resolve()).catch(fail));parser.on('error',fail)})}
function findRoot(dir){if(fs.existsSync(path.join(dir,'package.json')))return dir;const kids=fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.name.startsWith('.'));if(kids.length===1&&fs.existsSync(path.join(dir,kids[0].name,'package.json')))return path.join(dir,kids[0].name);throw Error('Could not find package.json at ZIP root or its single top-level folder')}
app.get('/health',(_q,r)=>r.json({ok:true,service:'Dolphin full-project builder'}));
function stageJob(id, stageIndex, message, percent) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'running';
  job.stageIndex = stageIndex;
  job.message = message;
  job.stageLabel = message;
  job.log = [];
  job.stageStartedAt = Date.now();
  job.progress = percent;
  job.updatedAt = Date.now();
  jobs.set(id, job);
}
function publicJob(job) {
  const now = Date.now();
  const elapsedMs = Math.max(0, now - (job.startedAt || job.created || now));
  const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
  // Stage percentages are milestones, not measured work completed; avoid a misleading ETA.
  const estimatedRemainingMs = null;
  const steps = (job.steps || []).map((label, index) => ({
    label,
    status: job.status === 'done' ? 'completed' : job.status === 'failed' && index === job.stageIndex ? 'failed' : index < (job.stageIndex || 0) ? 'completed' : index === job.stageIndex && job.status === 'running' ? 'in_progress' : 'pending'
  }));
  return { status: job.status, message: job.message, error: job.error, downloadPath: job.downloadPath,
    progress, currentStep: job.steps && job.steps[job.stageIndex] || null, steps, elapsedMs, stageElapsedMs: Math.max(0, now - (job.stageStartedAt || job.startedAt || now)), estimatedRemainingMs, log: job.log || [] };
}
app.post('/api/projects/build',upload.single('project'),(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Upload a project ZIP in field "project"'});
  const target=req.query.target==='apk'?'apk':req.query.target==='web'?'web':null;
  if(!target){fs.unlink(req.file.path,()=>{});return res.status(400).json({error:'target must be web or apk'})}
  const id=crypto.randomBytes(12).toString('hex'),dir=path.join(JOBS,id);
  fs.mkdirSync(dir,{recursive:true});
  const steps = ['Extract project ZIP','Install npm dependencies','Build React/Vite app', ...(target==='apk'?['Prepare Android project','Compile Android APK']:['Package web ZIP']), 'Prepare download'];
  jobs.set(id,{status:'queued',created:Date.now(),startedAt:Date.now(),progress:0,stageIndex:0,steps,message:'Waiting for build worker'});
  res.status(202).json({jobId:id});
  (async()=>{
    try{
      stageJob(id,0,'Extracting project ZIP',2);
      const extracted=path.join(dir,'source');fs.mkdirSync(extracted);
      await extractSafe(req.file.path,extracted);
      const project=findRoot(extracted),pkg=JSON.parse(fs.readFileSync(path.join(project,'package.json'),'utf8'));
      const scripts=pkg.scripts||{};
      const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
      // Prefer the project's explicit production build script; otherwise infer common React tooling.
      let buildArgs=null, buildDescription='';
      if(scripts.build){
        buildArgs=['run','build']; buildDescription='package.json build script';
      }else if(scripts['build:web']){
        buildArgs=['run','build:web']; buildDescription='package.json build:web script';
      }else if(scripts['build:prod']){
        buildArgs=['run','build:prod']; buildDescription='package.json build:prod script';
      }else if(deps.vite){
        buildArgs=['exec','--','vite','build']; buildDescription='Vite fallback';
      }else if(deps['react-scripts']){
        buildArgs=['exec','--','react-scripts','build']; buildDescription='Create React App fallback';
      }else{
        throw Error('No supported production build command found. Add scripts.build to package.json (for example, "build": "vite build") or use Vite/react-scripts dependencies.');
      }
      const hasNpmLock=fs.existsSync(path.join(project,'package-lock.json'))||fs.existsSync(path.join(project,'npm-shrinkwrap.json'));
      const hasYarnLock=fs.existsSync(path.join(project,'yarn.lock'));
      const hasPnpmLock=fs.existsSync(path.join(project,'pnpm-lock.yaml'));
      stageJob(id,1,hasNpmLock?'Installing npm dependencies from lockfile':(hasYarnLock||hasPnpmLock?'Installing dependencies (non-npm lockfile detected)':'Installing npm dependencies (no lockfile)'),8);
      // npm ci is only valid with an npm lockfile. For Yarn/pnpm projects, use npm install as a compatibility fallback.
      await run('npm',[hasNpmLock?'ci':'install','--no-audit','--no-fund','--prefer-offline'],project,600000,id);
      stageJob(id,2,'Building production web bundle ('+buildDescription+')',38);
      await run('npm',buildArgs,project,600000,id);
      const outputCandidates=[];
      // Output folder names are fixed on purpose: a name taken from the uploaded package.json could point outside the project.
      outputCandidates.push('dist','build','out');
      const outputName=outputCandidates.find(name=>fs.existsSync(path.join(project,name))&&fs.statSync(path.join(project,name)).isDirectory());
      if(!outputName)throw Error('Build command completed, but no web output directory was found. Checked dist/, build/, and out/. Configure your tool to emit static files to one of these directories.');
      const dist=path.join(project,outputName);
      if(target==='web'){
        stageJob(id,3,'Packaging web ZIP',72);
        const out=path.join(dir,'web-build.zip');await run('zip',['-qr',out,'.'],dist,600000,id);
        stageJob(id,4,'Preparing download',95);
        const j=jobs.get(id);Object.assign(j,{status:'done',progress:100,message:'Web build completed',downloadPath:'/api/projects/build/'+id+'/download',file:out,finishedAt:Date.now()});jobs.set(id,j);
      }else{
        stageJob(id,3,'Preparing Android project and copying web assets',58);
        const android=path.join(dir,'android');fs.cpSync(TEMPLATE,android,{recursive:true});
        const assets=path.join(android,'app/src/main/assets/www');fs.mkdirSync(assets,{recursive:true});fs.cpSync(dist,assets,{recursive:true});
        const builtIndex=path.join(assets,'index.html');
        if(fs.existsSync(builtIndex)){let html=fs.readFileSync(builtIndex,'utf8');html=html.replace(/(src|href)="\/(?!\/)/g,'$1="./').replace(/url\((['"]?)\/(?!\/)/g,'url($1./');fs.writeFileSync(builtIndex,html)}
        stageJob(id,4,'Compiling Android APK with Gradle (this is often the longest step)',62);
        await run(process.env.GRADLE_BIN||'gradle',['--console=plain','--info','assembleDebug'],android,1200000,id);
        const apk=path.join(android,'app/build/outputs/apk/debug/app-debug.apk');if(!fs.existsSync(apk))throw Error('Gradle completed but APK was not found');
        stageJob(id,5,'Copying APK and preparing download',96);
        const out=path.join(dir,'dolphin-export.apk');fs.copyFileSync(apk,out);
        const j=jobs.get(id);Object.assign(j,{status:'done',progress:100,message:'APK build completed',downloadPath:'/api/projects/build/'+id+'/download',file:out,finishedAt:Date.now()});jobs.set(id,j);
      }
    }catch(e){const j=jobs.get(id)||{};Object.assign(j,{status:'failed',error:String(e.message||e).slice(-9000),finishedAt:Date.now()});jobs.set(id,j)}
    finally{fs.unlink(req.file.path,()=>{})}
  })();
});
app.get('/api/projects/build/:id',(req,res)=>{const j=jobs.get(req.params.id);if(!j)return res.status(404).json({error:'Unknown job'});res.json(publicJob(j))});app.get('/api/projects/build/:id/download',(req,res)=>{const j=jobs.get(req.params.id);if(!j||j.status!=='done'||!j.file||!fs.existsSync(j.file))return res.status(404).json({error:'Build artifact not ready'});res.download(j.file,path.basename(j.file))});app.listen(PORT,()=>console.log('Dolphin build service listening on '+PORT));
