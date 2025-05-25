#!/usr/bin/env node

/*
    Entry module of the project 

    used yargs module to read cli input from user
    yargs.command(<command object>,<handler function>) 
*/

const {Worker}= require("worker_threads");

const yargs=require('yargs');
const threads=require('./Threads');
console.log("Memory visualiser");

function start_visualiser()
{
    console.log("Two threads are executing concurrently");
    const worker=new Worker('./Mainthread');
    //threads.factorial();
    //threads.fibnacci_series();
}

function view_menu()
{
    console.log("1 - Start visualiser");
}

yargs.command({
    command: 'menu',
    describe : 'Read the menu option',
    
    builder:{
    option:{
        describe : 'Enter menu option',
        demandOption:true,
        type: 'number'    
    }
    }
    ,
    handler(arg)
    {
        switch (arg.option)
        {
            case 0:
                view_menu();
                break;
            case 1:
                console.log("");
                start_visualiser();
                break;
        }
    }
});

yargs.parse();