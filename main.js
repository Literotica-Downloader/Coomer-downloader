//libraries
const {styleText}=require('node:util');
const {promises:{mkdir,rename},createWriteStream}=require('fs');
const {join}=require('path');
const {once}=require('events');
const prompt=require('prompt-sync')({sigint:true});
const {Readable:{fromWeb},promises:{pipeline}}=require('stream');
// const {exiftool:{write,end}}=require('exiftool-vendored');
//input
const service=process.argv[2]??prompt('Service (onlyfans/fansly/etc.)? ');
const creator=process.argv[3]??prompt('Creator? ');
function sleep5(){
	console.log(styleText('red',`Sleeping 5 seconds and trying again...`));
	return new Promise(resolve=>setTimeout(resolve,5000));
}
async function download(weburl,filename,datetime){
	const fullpath=join(creator,filename);
	const tempfile=fullpath+'.part';
	const stream=createWriteStream(tempfile);
	for(;;)
	try{
		fromWeb((await fetch(weburl)).body).pipe(stream);
		break;
	}catch(err){
		console.log(styleText('red',err));
		console.log(styleText('red',`Could not download ${weburl}`));
		await sleep5();
	}
	await once(stream,'finish');
	await rename(tempfile,fullpath);
	console.log(styleText('green',`Finished downloading ${filename}.`));
	// const tPosition=datetime.substring('T');
	// await write(fullpath,{
	// 	DateCreated:datetime.substring(0,tPosition).replaceAll('-',':'),
	// 	TimeCreated:datetime.substring(tPosition+1),
	// });
	// await end();
	// console.log(styleText('purple',`Added metadata to ${filename}.`));
}
//main
(async ()=>{
	await mkdir(creator,{recursive:true});
	console.log(styleText('yellow',`Created directory ${creator}.`));
	for(let offset=0;;){
		console.log(styleText('blue',`Reading posts ${offset} to ${offset+50}.`));
		let downloadBatch=[];
		let posts;
		for(;;)
			try{
				let response=await (
					await fetch(
						`https://coomer.st/api/v1/${service}/user/${creator}/posts?o=${offset}`,
						{
							method:'GET',
							headers:{
								'accept': 'text/css'
							}
						}
					)
				)
				if(!response.ok)
					throw new Error(`HTTP response status {response.status}.`);
				posts=await response.json()
				break;
			}catch(err){
				console.log(styleText('red',err));
				console.log(styleText('red',`Could not get API response.`));
				await sleep5();
			}
		if(posts.error!==undefined)break;
		for(let {id,title,published,file:{path},attachments} of posts){
			if(title.trim().length===0)
				title=id;
			else
				title=title.replaceAll('/','');//ignore / for proper filename
			let count=0;
			if(path!=undefined)
				downloadBatch.push(
					download(
						`https://n2.coomer.st/data${path}`,
						`${title}${attachments.length===0?'':`(${++count})`}${path.substring(path.indexOf('.'))}`,//extension with title as filename
						published
					)
				);
			for(const {path} of attachments){
				console.log(styleText('cyan',`Reading extra image ${count} of post ${title}`));
				count++;
				downloadBatch.push(
					download(
						`https://n2.coomer.st/data${path}`,
						`${title}${count===1?'':`(${count})`}${path.substring(path.indexOf('.'))}`,//extension with title as filename
						published
					)
				);
			}
		}
		console.log(styleText('blue',`Downloading from posts ${offset} to ${offset+50}.`));
		await Promise.all(downloadBatch);
		console.log(styleText('blue',`Finished posts ${offset} to ${offset+=50}.`));
	}
})();
