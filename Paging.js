#!/usr/bin/env node

const readline = require('readline');
const { performance } = require('perf_hooks');

class Page 
{
    constructor(processId, virtualAddress, size = 4096) 
    {
        this.processId = processId;
        this.virtualAddress = virtualAddress;
        this.physicalAddress = null;
        this.size = size;
        this.inMemory = false;
        this.dirty = false;
        this.lastAccessed = Date.now();
        this.data = `P${processId}_Page_${virtualAddress}`;
    }
}

class PageTableEntry 
{
    constructor(virtualAddress) 
    {
        this.virtualAddress = virtualAddress;
        this.physicalAddress = null;
        this.present = false;
        this.dirty = false;
        this.accessed = false;
        this.protection = 'RW';
    }
}

class PageTable 
{
  
    constructor(processId) 
    {
        this.processId = processId;
        this.entries = new Map();
        this.baseAddress = processId * 1000; // Simulate different base addresses
    }

    addEntry(virtualAddress) 
    {
        if (!this.entries.has(virtualAddress)) {
            this.entries.set(virtualAddress, new PageTableEntry(virtualAddress));
        }
        return this.entries.get(virtualAddress);
    }

    getEntry(virtualAddress) 
    {
        return this.entries.get(virtualAddress);
    }

    getAllEntries() {
        return Array.from(this.entries.values());
    }
}

class PhysicalMemory {
    constructor(totalFrames = 8) {
        this.totalFrames = totalFrames;
        this.frames = new Array(totalFrames).fill(null);
        this.freeFrames = new Set(Array.from({length: totalFrames}, (_, i) => i));
        this.history = [];
    }

    allocateFrame() {
        if (this.freeFrames.size > 0) {
            const frameNumber = this.freeFrames.values().next().value;
            this.freeFrames.delete(frameNumber);
            return frameNumber;
        }
        return null; // Memory full
    }

    deallocateFrame(frameNumber) {
        if (frameNumber >= 0 && frameNumber < this.totalFrames) {
            this.frames[frameNumber] = null;
            this.freeFrames.add(frameNumber);
        }
    }

    getFrame(frameNumber) 
    {
        return this.frames[frameNumber];
    }

    setFrame(frameNumber, page) 
    {
        this.frames[frameNumber] = page;
        page.physicalAddress = frameNumber;
        page.inMemory = true;
    }

    findLRUFrame() 
    {
        let lruFrame = 0;
        let oldestTime = this.frames[0]?.lastAccessed || 0;
        
        for (let i = 1; i < this.totalFrames; i++) {
            if (this.frames[i] && this.frames[i].lastAccessed < oldestTime) {
                oldestTime = this.frames[i].lastAccessed;
                lruFrame = i;
            }
        }
        return lruFrame;
    }
}

class SecondaryStorage 
{
    constructor() 
    {
        this.storage = new Map();
        this.swapOperations = 0;
    }

    storePage(page) 
    {
        const swapAddress = `SWAP_${this.swapOperations++}`;
        this.storage.set(page.virtualAddress, {
            page: page,
            swapAddress: swapAddress,
            timestamp: Date.now()
        });
        page.inMemory = false;
        page.physicalAddress = null;
        return swapAddress;
    }

    retrievePage(virtualAddress) 
    {
        return this.storage.get(virtualAddress);
    }

    removePage(virtualAddress) 
    {
        this.storage.delete(virtualAddress);
    }

    getAllPages() 
    {
        return Array.from(this.storage.values());
    }
}

class MMU 
{
    constructor() 
    {
        this.physicalMemory = new PhysicalMemory(8);
        this.secondaryStorage = new SecondaryStorage();
        this.pageTables = new Map();
        this.tlb = new Map(); // TLB
        this.tlbHits = 0;
        this.tlbMisses = 0;
        this.pageFaults = 0;
        this.operationHistory = [];
        this.currentStep = -1;
    }

    createPageTable(processId) 
    {
        const pageTable = new PageTable(processId);
        this.pageTables.set(processId, pageTable);
        return pageTable;
    }

    translateAddress(processId, virtualAddress) 
    {
        const operation = {
            type: 'ADDRESS_TRANSLATION',
            processId: processId,
            virtualAddress: virtualAddress,
            steps: [],
            timestamp: Date.now()
        };

        //Check TLB
        const tlbKey = `${processId}_${virtualAddress}`;
        operation.steps.push({
            step: 'TLB_LOOKUP',
            description: `Checking TLB for process ${processId}, virtual address ${virtualAddress}`,
            success: this.tlb.has(tlbKey)
        });

        if (this.tlb.has(tlbKey)) 
        {
            this.tlbHits++;
            const physicalAddress = this.tlb.get(tlbKey);
            operation.steps.push({
                step: 'TLB_HIT',
                description: `TLB hit! Physical address: ${physicalAddress}`,
                physicalAddress: physicalAddress
            });
            operation.physicalAddress = physicalAddress;
            this.recordOperation(operation);
            return physicalAddress;
        }

        this.tlbMisses++;
        operation.steps.push({
            step: 'TLB_MISS',
            description: 'TLB miss, checking page table'
        });

        // Check Page Table
        const pageTable = this.pageTables.get(processId);
        if (!pageTable) 
        {
            operation.steps.push({
                step: 'ERROR',
                description: 'Page table not found for process'
            });
            this.recordOperation(operation);
            return null;
        }

        let pageEntry = pageTable.getEntry(virtualAddress);
        if (!pageEntry) {
            pageEntry = pageTable.addEntry(virtualAddress);
        }

        operation.steps.push({
            step: 'PAGE_TABLE_LOOKUP',
            description: `Checking page table entry for virtual address ${virtualAddress}`,
            present: pageEntry.present
        });

        // Step 3: Handle Page Fault if necessary
        if (!pageEntry.present) {
            this.pageFaults++;
            operation.steps.push({
                step: 'PAGE_FAULT',
                description: 'Page fault occurred, loading from secondary storage'
            });

            const physicalAddress = this.handlePageFault(processId, virtualAddress, pageEntry);
            operation.physicalAddress = physicalAddress;
            
            // Update TLB
            this.tlb.set(tlbKey, physicalAddress);
            operation.steps.push({
                step: 'TLB_UPDATE',
                description: `Updated TLB with mapping ${virtualAddress} -> ${physicalAddress}`
            });
        } else {
            operation.steps.push({
                step: 'PAGE_HIT',
                description: `Page found in memory at physical address ${pageEntry.physicalAddress}`
            });
            operation.physicalAddress = pageEntry.physicalAddress;
        }

        // Update access time
        const frame = this.physicalMemory.getFrame(pageEntry.physicalAddress);
        if (frame) {
            frame.lastAccessed = Date.now();
            pageEntry.accessed = true;
        }

        this.recordOperation(operation);
        return pageEntry.physicalAddress;
    }

    handlePageFault(processId, virtualAddress, pageEntry) {
        const operation = {
            type: 'PAGE_FAULT_HANDLING',
            processId: processId,
            virtualAddress: virtualAddress,
            steps: [],
            timestamp: Date.now()
        };

        // Try to allocate a free frame
        let frameNumber = this.physicalMemory.allocateFrame();
        
        if (frameNumber === null) {
            // No free frames, need to evict a page (LRU)
            frameNumber = this.physicalMemory.findLRUFrame();
            const victimPage = this.physicalMemory.getFrame(frameNumber);
            
            operation.steps.push({
                step: 'PAGE_EVICTION',
                description: `Evicting page from frame ${frameNumber} (LRU)`,
                victimPage: victimPage.data
            });

            // Update victim's page table entry
            const victimPageTable = this.pageTables.get(victimPage.processId);
            const victimEntry = victimPageTable.getEntry(victimPage.virtualAddress);
            victimEntry.present = false;
            victimEntry.physicalAddress = null;

            // Store victim page in secondary storage
            const swapAddress = this.secondaryStorage.storePage(victimPage);
            operation.steps.push({
                step: 'SWAP_OUT',
                description: `Swapped out page to ${swapAddress}`
            });

            this.physicalMemory.deallocateFrame(frameNumber);
            frameNumber = this.physicalMemory.allocateFrame();
        }

        // Load page from secondary storage or create new page
        let page;
        const storedPage = this.secondaryStorage.retrievePage(virtualAddress);
        
        if (storedPage) {
            page = storedPage.page;
            this.secondaryStorage.removePage(virtualAddress);
            operation.steps.push({
                step: 'SWAP_IN',
                description: `Loaded page from secondary storage`
            });
        } else {
            page = new Page(processId, virtualAddress);
            operation.steps.push({
                step: 'PAGE_CREATION',
                description: `Created new page for virtual address ${virtualAddress}`
            });
        }

        // Place page in physical memory
        this.physicalMemory.setFrame(frameNumber, page);
        pageEntry.present = true;
        pageEntry.physicalAddress = frameNumber;
        pageEntry.accessed = true;

        operation.steps.push({
            step: 'FRAME_ALLOCATION',
            description: `Allocated frame ${frameNumber} for the page`,
            frameNumber: frameNumber
        });

        this.recordOperation(operation);
        return frameNumber;
    }

    recordOperation(operation) 
    {
        this.operationHistory = this.operationHistory.slice(0, this.currentStep + 1);
        this.operationHistory.push(operation);
        this.currentStep++;
    }

    getMemoryState() 
    {
        return {
            physicalMemory: this.physicalMemory.frames.map((page, index) => ({
                frameNumber: index,
                page: page ? {
                    processId: page.processId,
                    virtualAddress: page.virtualAddress,
                    data: page.data,
                    lastAccessed: page.lastAccessed
                } : null
            })),
            secondaryStorage: this.secondaryStorage.getAllPages().map(entry => ({
                virtualAddress: entry.page.virtualAddress,
                processId: entry.page.processId,
                data: entry.page.data,
                swapAddress: entry.swapAddress
            })),
            pageTables: Array.from(this.pageTables.entries()).map(([processId, pageTable]) => ({
                processId: processId,
                entries: pageTable.getAllEntries().map(entry => ({
                    virtualAddress: entry.virtualAddress,
                    physicalAddress: entry.physicalAddress,
                    present: entry.present,
                    accessed: entry.accessed,
                    dirty: entry.dirty
                }))
            })),
            tlb: Array.from(this.tlb.entries()).map(([key, physicalAddr]) => {
                const [processId, virtualAddr] = key.split('_');
                return {
                    processId: parseInt(processId),
                    virtualAddress: parseInt(virtualAddr),
                    physicalAddress: physicalAddr
                };
            }),
            statistics: {
                tlbHits: this.tlbHits,
                tlbMisses: this.tlbMisses,
                pageFaults: this.pageFaults,
                tlbHitRatio: this.tlbHits / (this.tlbHits + this.tlbMisses) || 0
            }
        };
    }
}

class Process 
{
    constructor(id, name) 
    {
        this.id = id;
        this.name = name;
        this.memoryRequests = [];
        this.currentRequest = 0;
        this.completed = false;
        this.generateMemoryRequests();
    }

    generateMemoryRequests() 
    {
        const requestCount = Math.floor(Math.random() * 6) + 5; 
        for (let i = 0; i < requestCount; i++) {
            this.memoryRequests.push({
                virtualAddress: i * 4096 + Math.floor(Math.random() * 1000), // Simulate virtual addresses
                operation: Math.random() > 0.3 ? 'READ' : 'write',
                description: `${this.name} - ${Math.random() > 0.5 ? 'Data access' : 'Code execution'} #${i}`
            });
        }
    }

    getNextRequest() 
    {
        if (this.currentRequest >= this.memoryRequests.length) 
        {
            this.completed = true;
            return null;
        }
        
        const request = {
            ...this.memoryRequests[this.currentRequest],
            processId: this.id,
            processName: this.name
        };
        this.currentRequest++;
        return request;
    }
}

class MemoryVisualizer 
{
    constructor() 
    {
        this.mmu = new MMU();
        this.processes = [];
        this.isRunning = false;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }
}
