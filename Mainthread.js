const {Worker}= require('worker_threads');
const { check } = require('yargs');

const workerthread= new Worker('./workerthread.js');
/*
workerthread.on('message',(msg)=>
{
    console.log(msg);
}n
);
*/

var timelimit=3;// 1 Timelimit = 1 seconds (Assumption)
function reset_time_limit()
{
    timelimit=3;
}
function decrement_time_limit()
{
    timelimit--;
}
async function detected_time_out()
{
    console.log("\Time out reached -main thread suspended temporarily\n");
    console.log("Process worker thread");
    //timelimit=5;
    //workerthread.postMessage('Start worker thread');
    await new Promise(res=> setTimeout(res,5000));
    reset_time_limit();
}
async function update_time_limit()
{
    if((timelimit-1)==0)
    {
        await detected_time_out();
        console.log("Main thread resumed");
    }
        
    else
        decrement_time_limit();
}

async function fibnacci_series()
{
    var i=1;
    console.log(`\nProcess name :fibonacci series`);
    var first=0,second=1;
    console.log(`Series ${i} : ${first}`);
    i++;
    var counter=0
    var buffer;
    while(counter<10)
    {
        console.log(`Series ${i} : ${second}`);
        buffer=second;
        second=first+second;
        first=buffer;
        counter++;
        i++;
        await update_time_limit();
    }
    console.log("Main thread completed");
}
fibnacci_series();