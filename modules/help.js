const { MessageEmbed } = require('discord.js-light')

module.exports = (plugin, config) => {
    plugin.commands.addSimple('help', /* TODO */ plugin.localeString('help.embedName'), (message, [commandName]) => {
        let embed = new MessageEmbed()
        if (!commandName) {
            embed.setTitle(plugin.localeString('help.embedName'))
    
            plugin.commands._commands.array().forEach(cmd => {
                let cmdEmoji = message.guild.emojis.cache.find(emoji => emoji.name === cmd.emoji);

                embed.addField(
                    `${cmdEmoji || ''} \`${config.bot.prefix}${cmd.base + (cmd.args ? ' ' + cmd.args.join(' ') : '')}\``, 
                    `${plugin.localeString('help.description')}${cmd.info || plugin.localeString('help.noDescription')}` +
                    `\n${plugin.localeString('help.aliases')}${cmd.aliases ? cmd.aliases.map(a => '`' + a + '`').join(', ') : plugin.localeString('help.noAliases')}\n`
                )
            })

            plugin.bot.typing(message, () => {
                message.channel.send(embed)
            })
        } else {
            let cmd = plugin.commands._commands.array().find(cmd => 
                !cmd.aliases ? 
                cmd.base === commandName : 
                cmd.base === commandName || commandName === cmd.aliases.find(o => o === commandName)
            )

            if (cmd) {
                embed.setTitle('`' + config.bot.prefix+cmd.base + (cmd.args ? ' ' + cmd.args.join(' ') : '') + '`')
                embed.addField(plugin.localeString('help.description'), cmd.info || plugin.localeString('help.noDescription'))
                embed.addField(plugin.localeString('help.aliases'), cmd.aliases ? cmd.aliases.map(a => '`' + a + '`').join(', ') : plugin.localeString('help.noAliases'))
                
                plugin.bot.typing(message, () => {
                    message.channel.send(embed)
                })

                return
            }

            embed.setTitle(plugin.localeString('help.notFound', commandName))
            embed.setDescription(plugin.localeString('help.notFoundHelp', `${config.bot.prefix}help`))

            message.channel.startTyping();

            plugin.bot.typing(message, () => {
                message.channel.send(embed)
            })
        }
      })
}