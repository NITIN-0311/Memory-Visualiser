function factorial()
{
    var fact = 1;
    for(var i=1;i<=10;i++)
    {
        fact=fact*i;
        console.log(`${i} Factoril = ${fact}`);
    }
}

function fibnacci_series()
{
    var first=0,second=1;
    console.log(first);
    console.log(second);
    var counter=0
    var buffer;

    while(counter<10)
    {
        console.log(second);

        buffer=second;
        second=first+second;
        first=buffer;
           
        counter++;
    }
}

module.exports.fibnacci_series=fibnacci_series;
module.exports.factorial=factorial;

/*
    0 1 1 2 3 5 8

    print first
    print second

    second=first+second
    first=second

*/