
var b = '\x1b[40m \x1b[0m'
var w = '\x1b[107m \x1b[0m'
var g = '\x1b[100m \x1b[0m'
var l = '\x1b[47m \x1b[0m'
var r = '\x1b[101m \x1b[0m'

var logo = [
	[b,b,b,b,b,b,b,b,b,b,b,b,b,b,b,b],
	[b,g,w,b,w,w,b,w,w,b,w,w,b,w,g,b],
	[b,w,w,b,w,w,b,w,w,b,w,w,b,w,w,b],
	[b,b,b,b,b,l,b,b,l,b,b,l,b,b,b,b],
	[b,w,w,l,g,g,b,g,g,b,g,g,b,w,w,b],
	[b,w,w,b,g,w,w,w,w,w,w,g,l,w,w,b],
	[b,b,b,b,b,r,w,r,r,r,w,b,b,b,b,b],
	[b,w,w,l,g,w,r,w,w,r,w,g,b,w,w,b],
	[b,w,w,b,g,w,r,w,w,r,w,g,l,w,w,b],
	[b,b,b,b,b,w,r,w,w,r,w,b,b,b,b,b],
	[b,w,w,l,g,w,w,w,w,w,w,g,b,w,w,b],
	[b,w,w,b,g,g,b,g,g,b,g,g,l,w,w,b],
	[b,b,b,b,l,b,b,l,b,b,l,b,b,b,b,b],
	[b,w,w,b,w,w,b,w,w,b,w,w,b,w,w,b],
	[b,g,w,b,w,w,b,w,w,b,w,w,b,w,g,b],
	[b,b,b,b,b,b,b,b,b,b,b,b,b,b,b,b]
]

export default function() {
	for (var i = 0; i < logo.length; i++) {
		var str = ''
		for (var j = 0; j < logo[i].length; j++) {
			str += logo[i][j]
			str += logo[i][j]
		}
		console.log(str)
	}
};
