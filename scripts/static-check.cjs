// Dependency-free parse/import/action/schema checks. It is NOT a replacement for npm build or live E2E.
const fs=require('fs'),path=require('path');
let ts;try{ts=require('typescript')}catch{try{ts=require(require('path').join(process.env.HOME||'/opt/nvm/versions/node/v22.16.0','lib/node_modules/typescript'))}catch{console.error('TypeScript not installed. Run npm install first.');process.exit(2)}}
const root=path.join(__dirname,'..');let errors=0,count=0;
const apiSource=fs.readFileSync(path.join(root,'supabase/functions/task-api/index.ts'),'utf8');
const actionNames=new Set((apiSource.match(/const actions=\[([^\]]+)\]/)||[])[1]?.match(/'([^']+)'/g)?.map(x=>x.slice(1,-1))||[]);
function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())visit(file);else if(/\.(tsx?|jsx?)$/.test(file)&&!file.endsWith('.d.ts')){count++;const source=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);for(const diag of ast.parseDiagnostics){errors++;const lc=ast.getLineAndCharacterOfPosition(diag.start||0);console.error('SYNTAX',path.relative(root,file),lc.line+1,ts.flattenDiagnosticMessageText(diag.messageText,' '))}for(const s of ast.statements)if(ts.isImportDeclaration(s)){const name=s.moduleSpecifier.text;if(name.startsWith('.')){const target=path.resolve(path.dirname(file),name);const matches=[target,target+'.ts',target+'.tsx',target+'.js',path.join(target,'index.ts')].some(fs.existsSync);if(!matches){errors++;console.error('MISSING IMPORT',file,name)}}}
if(file.startsWith(path.join(root,'src'))){for(const m of source.matchAll(/api(?:<[^>]+>)?\(\s*['"]([\w_]+)['"]/g))if(!actionNames.has(m[1])){errors++;console.error('API ACTION MISSING:',m[1],path.relative(root,file))}}
}}}
visit(path.join(root,'src'));visit(path.join(root,'supabase/functions'));
const sql=fs.readFileSync(path.join(root,'supabase/migrations/202610080001_initial.sql'),'utf8');
const tables=[...sql.matchAll(/create table public\.([\w_]+)/ig)].map(m=>m[1]);
for(const table of tables){if(!sql.includes(`alter table public.${table} enable row level security;`)){errors++;console.error('RLS MISSING:',table)}}
if(sql.includes('service_role_key')||fs.readFileSync(path.join(root,'src/lib/supabase.ts'),'utf8').includes('SERVICE_ROLE_KEY')){errors++;console.error('Service key leaked into frontend')}
if(!apiSource.includes('client_request_id')){errors++;console.error('Create task idempotency missing')}
console.log(`STATIC AUDIT: ${count} TS/TSX files parsed; ${tables.length} SQL tables with RLS; ${actionNames.size} API actions; ${errors} errors`);
process.exit(errors?1:0);
