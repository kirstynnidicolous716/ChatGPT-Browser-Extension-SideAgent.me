// common/protocol.js
export const TOOL_SPECS=[
 {type:"function",function:{name:"getSnapshotMeta",description:"Get current page snapshot metadata.",parameters:{type:"object",properties:{}}}},
 {type:"function",function:{name:"getDigest",description:"Return a compact digest of the page (headings, links sample, forms/buttons count).",parameters:{type:"object",properties:{maxLinks:{type:"integer"},maxHeadings:{type:"integer"}},required:[]}}},
 {type:"function",function:{name:"getSourceChunk",description:"Fetch a chunk of the page HTML.",parameters:{type:"object",properties:{index:{type:"integer"},size:{type:"integer"}},required:["index"]}}},
 {type:"function",function:{name:"getHtmlBySelector",description:"Return outerHTML for matches of selector.",parameters:{type:"object",properties:{selector:{type:"string"},limit:{type:"integer",default:5},maxChars:{type:"integer",default:20000}},required:["selector"]}}},
 {type:"function",function:{name:"getTextBySelector",description:"Return textContent for matches of selector.",parameters:{type:"object",properties:{selector:{type:"string"},limit:{type:"integer",default:10},maxChars:{type:"integer",default:20000}},required:["selector"]}}},
 {type:"function",function:{name:"querySelectorAll",description:"Query DOM and return mapped array.",parameters:{type:"object",properties:{selector:{type:"string"},map:{type:"string","enum":["outerHTML","text","value","attrs"],default:"outerHTML"},maxResults:{type:"integer",default:50}},required:["selector"]}}},
 {type:"function",function:{name:"click",description:"Click element.",parameters:{type:"object",properties:{selector:{type:"string"},index:{type:"integer",default:0}},required:["selector"]}}},
 {type:"function",function:{name:"typeInto",description:"Type into element.",parameters:{type:"object",properties:{selector:{type:"string"},text:{type:"string"},clear:{type:"boolean",default:true},submit:{type:"boolean",default:false}},required:["selector","text"]}}},
 {type:"function",function:{name:"scrollPage",description:"Scroll page.",parameters:{type:"object",properties:{target:{type:"string","enum":["top","bottom","selector"],default:"bottom"},selector:{type:"string"}}}}},
 {type:"function",function:{name:"evalInPage",description:"Eval code in page.",parameters:{type:"object",properties:{code:{type:"string"},world:{type:"string","enum":["MAIN","ISOLATED"],default:"ISOLATED"}},required:["code"]}}},
 {type:"function",function:{name:"callLib",description:"Call window.DynamicLib[name](...).",parameters:{type:"object",properties:{name:{type:"string"},args:{type:"array",items:{}}},required:["name"]}}}
];
