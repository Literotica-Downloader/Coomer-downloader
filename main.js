//libraries
const {styleText}=require('node:util');
const {promises:{mkdir,rename},createWriteStream}=require('fs');
const {join}=require('path');
const {once}=require('events');
const prompt=require('prompt-sync')({sigint:true});
const {Readable:{fromWeb},promises:{pipeline}}=require('stream');
var filenameCount={};//counts files of same name
var renames=[];//stores all the names to add (1) to;
// const {exiftool:{write,end}}=require('exiftool-vendored');
//input
const service=process.argv[2]??prompt('Service (onlyfans/fansly/etc.)? ');
const creator=process.argv[3]??prompt('Creator? ');
function sleep10(){
	console.log(styleText('red',`Trying again after 10 seconds...`));
	return new Promise(resolve=>setTimeout(resolve,10000));
}
async function download(weburl,filename,extension,datetime){
	let fullpath;
	switch(filenameCount[filename]){
		case undefined:
			filenameCount[filename]=1;
			fullpath=join(creator,filename+extension);
			break;
		case 1:
			renames.push([filename,extension]);
		default:
			fullpath=join(creator,`${filename}(${++filenameCount[filename]})${extension}`);
	}
	const tempfile=fullpath+'.part';
	const stream=createWriteStream(tempfile);
	stream.on('error',()=>{});//ignore low level process.exit(1) errors
	for(;;)
		try{
			let response=await fetch(weburl);
			if(!response.ok){
				await response.body.cancel();
				throw new Error(`HTTP response status ${response.status}.`);
			}
			const nodeStream=fromWeb(await response.body);
			nodeStream.on('error',()=>{});//ignore low level process.exit(1) errors
			nodeStream.pipe(stream);
			await once(stream,'finish');
			await rename(tempfile,fullpath);
			console.log(styleText('green',`Finished downloading ${filename}.`));
			break;
		}catch(err){
			console.error(err);
			console.log(styleText('red',`Could not download ${weburl} from post titled ${filename}`));
			await sleep10();
		}
	//NOTE: lines commented out to not update metadata using exiftool
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
					throw new Error(`HTTP response status ${response.status}.`);
				posts=await response.json()
				break;
			}catch(err){
				console.error(err);
				console.log(styleText('red',`Could not get API response.`));
				await sleep10();
			}
		if(posts.error!==undefined)break;
		for(let {id,title,published,file:{path},attachments} of posts){
			if(title.trim().length===0)
				title=id;
			else
				title=title.replaceAll('/','');//ignore '/' to get a proper filename
			if(path!=undefined)
				downloadBatch.push(
					download(
						'https://n1.coomer.st/data/'+path,
						title,
						path.substring(path.lastIndexOf('.')),
						published
					)
				);
			for(const {path} of attachments){
				console.log(styleText('cyan',`Reading extra image of post ${title}`));
				downloadBatch.push(
					download(
						'https://n1.coomer.st/data/'+path,
						title,
						path.substring(path.lastIndexOf('.')),
						published
					)
				);
			}
		}
		console.log(styleText('blue',`Downloading from posts ${offset} to ${offset+50}.`));
		await Promise.allSettled(downloadBatch);
		console.log(styleText('blue',`Finished posts ${offset} to ${offset+=50}.`));
	}
	console.log(styleText('purple','Renaming similar files.'))
	for(const [filename,extension] of renames){//rename to add (1)
		rename(
			join(creator,filename+extension),
			join(creator,filename+'(1)'+extension)
		);
	}
})();
