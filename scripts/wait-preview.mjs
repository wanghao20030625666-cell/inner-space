const url="http://127.0.0.1:5181/api/space";
for(let attempt=0;attempt<90;attempt++){try{const response=await fetch(url,{headers:{Cookie:"__sites_local_auth=1"}});if(response.ok){console.log("Local preview ready");process.exit(0);}}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}throw new Error("Local preview did not become ready");
