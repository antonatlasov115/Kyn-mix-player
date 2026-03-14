const { getData } = require('spotify-url-info')(require('node-fetch'))

async function test() {
    try {
        const data = await getData('https://open.spotify.com/track/4cOdK2wG2ZIB99Z99vIvqp')
        console.log(JSON.stringify(data, null, 2))
    } catch (e) {
        console.error(e)
    }
}

test()
