const fs = require('fs')
const path = require('path')

module.exports = (pl, cfg) => {
    pl.localesLoaded = false
    fs.readFile(path.join(__dirname, '../locale/' + cfg.lang + '.json'), { encoding: 'utf8' }, async (err, data) => {
        if (err) {
            return pl.err(err.message)
        }
        const jsdata = JSON.parse(data)
        // jsdata = LocaleManager.flat(jsdata)
        await Object.entries(jsdata).forEach(([key, val]) => {
            pl.locale.add(key, val)
        })

        pl.localesLoaded = true
    })
}