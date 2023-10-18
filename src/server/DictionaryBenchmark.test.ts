import { EDictionary } from './EDictionary'
import { NDictionary } from './NDictionary'

function benchmark(fn: any, iterations: number, name: string) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
        fn(i)
    }
    const stop = performance.now()
    console.log(`${ name } x ${ iterations } in ${ stop - start }ms`)
}

xdescribe('crude dictionary benchmarks', () => {
    it('yolo', () => {

        const dict = new NDictionary()
        dict.add({ nid: 101, ntype: 1 })
        dict.add({ nid: 102, ntype: 1 })
        dict.add({ nid: 103, ntype: 1 })
        dict.add({ nid: 104, ntype: 1 })

        //console.log('dict', dict)

        dict.remove({ nid: 102, ntype: 1 })
        dict.remove({ nid: 101, ntype: 1 })
       // console.log('dictAGAIN', dict)
    })

    xit('benchmark', () => {

        const iterations = 10000
        const ndict = new NDictionary()
        const edict = new EDictionary()

        benchmark((i: number) => {
            edict.add({ nid: i, ntype: 1 })
        }, iterations, 'edictionary add')

        benchmark((i: number) => {
            let total = 0
            edict.forEach(entity => {
                total += entity.nid
            })
        }, iterations, 'edictionary forEach')

        benchmark((i: number) => {
            edict.remove({ nid: i, ntype: 1 })
        }, iterations, 'edictionary remove')

        benchmark((i: number) => {
            ndict.add({ nid: i, ntype: 1 })
        }, iterations, 'ndictionary add')

        benchmark((i: number) => {
            let total = 0
            ndict.forEach(entity => {
                total += entity.nid
            })
        }, iterations, 'ndictionary forEach')

        benchmark((i: number) => {
            let total = 0
            for (let i = 0; i < ndict.array.length; i++) {
                total += ndict.array[i].nid
            }
        }, iterations, 'ndictionary for')

        benchmark((i: number) => {
            ndict.remove({ nid: i, ntype: 1 })
        }, iterations, 'ndictionary remove')
    })
})