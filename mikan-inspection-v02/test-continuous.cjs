// Continuous operation is now tested with the image-only controller.
const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,[require('node:path').join(__dirname,'test-image-control.cjs'),'--color'],{stdio:'inherit',env:process.env});
process.exitCode=result.status??1;
