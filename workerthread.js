
const {parentPort}= require('worker_threads');
let timelimit=3;
/*
parentPort.on('message',(msg)=>
{
    console.log("Message from main thread",msg);
}
);
*/

async function reset_time_limit()
{
    timelimit=3;
}
function decrement_time_limit()
{
    timelimit--;
}
async function detected_time_out()
{
    console.log("\nTime out reached - worker thread suspended temporarily\n");
    console.log("Process main thread");
    //parentPort.postMessage('Start Main thread');
    await new Promise(res=> setTimeout(res,5000));
    reset_time_limit();
}
async function update_time_limit()
{
    if((timelimit-1)==0)
    {
        await detected_time_out();
        console.log("\nWorker thread resumed\n");
    }
        
    else
        decrement_time_limit();
}
//console.log("Worker thread started");

async function factorial()
{
    console.log(`\nProcess name : Factorial`);
    var fact = 1;
    for(var i=1;i<=10;i++)
    {
        fact=fact*i;
        console.log(`${i} Factorial = ${fact}`);
        //console.log(`Timeout ${timelimit}`);
        await update_time_limit();
    }
    console.log("worker thread completed");
}
factorial();

/*
    The messgaes passed to main thread is
    stacked before it is completed

          if(timelimit==0)
        {
            parentPort.postMessage('Worker thread time out');
            timelimit=5;
        }
  
*/