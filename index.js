const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType
} = require('discord.js');
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;

const dbPath = path.join(__dirname, 'shop.db');
const db = new Database(dbPath);

db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        admin_role_id TEXT,
        buy_channel_id TEXT,
        notify_channel_id TEXT,
        log_channel_id TEXT,
        command_channel_id TEXT,
        kick_channel_id TEXT,
        category_id TEXT,
        welcome_channel_id TEXT,
        welcome_image_url TEXT,
        leave_image_url TEXT,
        allowed_roles TEXT,
        min_order_amount INTEGER DEFAULT 50,
        created_at INTEGER,
        buy_title TEXT DEFAULT 'Готовы сделать заказ?',
        buy_description TEXT DEFAULT 'Выберите киты из каналов ниже и нажмите открыть тикет.',
        buy_color TEXT DEFAULT '#5865F2',
        buy_footer TEXT DEFAULT 'Shop System'
    );

    CREATE TABLE IF NOT EXISTS guild_products (
        guild_id TEXT,
        product_id TEXT,
        channel_id TEXT,
        name TEXT,
        price TEXT,
        image TEXT,
        description TEXT,
        category TEXT,
        sort_order INTEGER DEFAULT 0,
        message_id TEXT,
        color TEXT DEFAULT '#5865F2',
        PRIMARY KEY (guild_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
        guild_id TEXT,
        channel_id TEXT,
        product_id TEXT,
        message_id TEXT,
        PRIMARY KEY (guild_id, channel_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS baskets (
        guild_id TEXT,
        user_id TEXT,
        product_id TEXT,
        count INTEGER DEFAULT 1,
        PRIMARY KEY (guild_id, user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
        guild_id TEXT,
        user_id TEXT,
        channel_id TEXT,
        created_at INTEGER,
        order_data TEXT,
        total INTEGER,
        PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS kicks (
        guild_id TEXT,
        kicker_id TEXT,
        victim_id TEXT,
        count INTEGER DEFAULT 1,
        PRIMARY KEY (guild_id, kicker_id, victim_id)
    );

    CREATE TABLE IF NOT EXISTS welcome_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 1,
        welcome_title TEXT DEFAULT 'Добро пожаловать!',
        welcome_description TEXT DEFAULT 'Привет, {user}!\\nТы {count}-й участник сервера.',
        welcome_color TEXT DEFAULT '#800080',
        leave_title TEXT DEFAULT 'До свидания!',
        leave_description TEXT DEFAULT 'Прощай, {user}.',
        leave_color TEXT DEFAULT '#800080'
    );
`);

try {
    const settingsTableInfo = db.prepare("PRAGMA table_info(guild_settings)").all();
    const settingsColumns = settingsTableInfo.map(col => col.name);
    
    const neededColumns = [
        'guild_id', 'admin_role_id', 'buy_channel_id', 'notify_channel_id',
        'log_channel_id', 'command_channel_id', 'kick_channel_id', 'category_id',
        'welcome_channel_id', 'welcome_image_url', 'leave_image_url',
        'allowed_roles', 'min_order_amount', 'created_at',
        'buy_title', 'buy_description', 'buy_color', 'buy_footer'
    ];
    
    for (const col of neededColumns) {
        if (!settingsColumns.includes(col)) {
            let columnType = 'TEXT';
            if (col === 'min_order_amount') columnType = 'INTEGER DEFAULT 50';
            if (col === 'created_at') columnType = 'INTEGER';
            if (col === 'allowed_roles') columnType = 'TEXT';
            if (col === 'buy_title') columnType = "TEXT DEFAULT 'Готовы сделать заказ?'";
            if (col === 'buy_description') columnType = "TEXT DEFAULT 'Выберите киты из каналов ниже и нажмите открыть тикет.'";
            if (col === 'buy_color') columnType = "TEXT DEFAULT '#5865F2'";
            if (col === 'buy_footer') columnType = "TEXT DEFAULT 'Shop System'";
            
            try {
                db.exec(`ALTER TABLE guild_settings ADD COLUMN ${col} ${columnType}`);
                console.log(`✅ Added column ${col} to guild_settings`);
            } catch (e) {
                console.log(`⚠️ Could not add column ${col}:`, e.message);
            }
        }
    }

    const productTableInfo = db.prepare("PRAGMA table_info(guild_products)").all();
    const hasColor = productTableInfo.some(col => col.name === 'color');

    if (!hasColor) {
        db.exec('ALTER TABLE guild_products ADD COLUMN color TEXT DEFAULT "#5865F2"');
        console.log('✅ Added color column to guild_products');
    }

    const ordersTableInfo = db.prepare("PRAGMA table_info(orders)").all();
    const hasOrderData = ordersTableInfo.some(col => col.name === 'order_data');
    const hasTotal = ordersTableInfo.some(col => col.name === 'total');

    if (!hasOrderData) {
        db.exec('ALTER TABLE orders ADD COLUMN order_data TEXT');
        console.log('✅ Added order_data column to orders');
    }

    if (!hasTotal) {
        db.exec('ALTER TABLE orders ADD COLUMN total INTEGER');
        console.log('✅ Added total column to orders');
    }

    const welcomeTableInfo = db.prepare("PRAGMA table_info(welcome_settings)").all();
    const welcomeColumns = welcomeTableInfo.map(col => col.name);
    
    if (!welcomeColumns.includes('leave_title')) {
        db.exec('ALTER TABLE welcome_settings ADD COLUMN leave_title TEXT DEFAULT "До свидания!"');
        console.log('✅ Added leave_title column');
    }
    
    if (!welcomeColumns.includes('leave_description')) {
        db.exec('ALTER TABLE welcome_settings ADD COLUMN leave_description TEXT DEFAULT "Прощай, {user}."');
        console.log('✅ Added leave_description column');
    }
    
    if (!welcomeColumns.includes('leave_color')) {
        db.exec('ALTER TABLE welcome_settings ADD COLUMN leave_color TEXT DEFAULT "#800080"');
        console.log('✅ Added leave_color column');
    }

    const messagesTableInfo = db.prepare("PRAGMA table_info(messages)").all();
    const hasGuildIdInMessages = messagesTableInfo.some(col => col.name === 'guild_id');
    
    if (!hasGuildIdInMessages) {
        console.log('⚠️ messages table needs update...');
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS messages_new (
                guild_id TEXT,
                channel_id TEXT,
                product_id TEXT,
                message_id TEXT,
                PRIMARY KEY (guild_id, channel_id, product_id)
            );
        `);
        
        const oldMessages = db.prepare('SELECT * FROM messages').all();
        for (const msg of oldMessages) {
            let guildId = null;
            
            const product = db.prepare('SELECT guild_id FROM guild_products WHERE channel_id = ? LIMIT 1').get(msg.channel_id);
            if (product) {
                guildId = product.guild_id;
            }
            
            if (!guildId) {
                const settings = db.prepare('SELECT guild_id FROM guild_settings LIMIT 1').get();
                if (settings) {
                    guildId = settings.guild_id;
                }
            }
            
            if (guildId) {
                db.prepare(`
                    INSERT OR IGNORE INTO messages_new (guild_id, channel_id, product_id, message_id)
                    VALUES (?, ?, ?, ?)
                `).run(guildId, msg.channel_id, msg.product_id, msg.message_id);
            }
        }
        
        db.exec(`
            DROP TABLE messages;
            ALTER TABLE messages_new RENAME TO messages;
        `);
        
        console.log('✅ messages table updated');
    }

    const basketsTableInfo = db.prepare("PRAGMA table_info(baskets)").all();
    const hasGuildIdInBaskets = basketsTableInfo.some(col => col.name === 'guild_id');
    
    if (!hasGuildIdInBaskets) {
        console.log('⚠️ baskets table needs update...');
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS baskets_new (
                guild_id TEXT,
                user_id TEXT,
                product_id TEXT,
                count INTEGER DEFAULT 1,
                PRIMARY KEY (guild_id, user_id, product_id)
            );
        `);
        
        try {
            const oldBaskets = db.prepare('SELECT * FROM baskets').all();
            for (const basket of oldBaskets) {
                let guildId = null;
                
                const product = db.prepare('SELECT guild_id FROM guild_products WHERE product_id = ? LIMIT 1').get(basket.product_id);
                if (product) {
                    guildId = product.guild_id;
                }
                
                if (!guildId) {
                    const settings = db.prepare('SELECT guild_id FROM guild_settings LIMIT 1').get();
                    if (settings) {
                        guildId = settings.guild_id;
                    }
                }
                
                if (guildId) {
                    db.prepare(`
                        INSERT OR IGNORE INTO baskets_new (guild_id, user_id, product_id, count)
                        VALUES (?, ?, ?, ?)
                    `).run(guildId, basket.user_id, basket.product_id, basket.count || 1);
                }
            }
        } catch (e) {
            console.log('⚠️ No data to migrate in baskets');
        }
        
        db.exec(`
            DROP TABLE baskets;
            ALTER TABLE baskets_new RENAME TO baskets;
        `);
        
        console.log('✅ baskets table updated');
    }

    const ordersTableInfo2 = db.prepare("PRAGMA table_info(orders)").all();
    const hasGuildIdInOrders = ordersTableInfo2.some(col => col.name === 'guild_id');

    if (!hasGuildIdInOrders) {
        console.log('⚠️ orders table needs update...');
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS orders_new (
                guild_id TEXT,
                user_id TEXT,
                channel_id TEXT,
                created_at INTEGER,
                order_data TEXT,
                total INTEGER,
                PRIMARY KEY (guild_id, user_id)
            );
        `);
        
        try {
            const oldOrders = db.prepare('SELECT * FROM orders').all();
            for (const order of oldOrders) {
                let guildId = null;
                
                const settings = db.prepare('SELECT guild_id FROM guild_settings LIMIT 1').get();
                if (settings) {
                    guildId = settings.guild_id;
                }
                
                if (guildId) {
                    db.prepare(`
                        INSERT OR IGNORE INTO orders_new (guild_id, user_id, channel_id, created_at, order_data, total)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(guildId, order.user_id, order.channel_id, order.created_at, order.order_data || null, order.total || 0);
                }
            }
        } catch (e) {
            console.log('⚠️ No data to migrate in orders');
        }
        
        db.exec(`
            DROP TABLE orders;
            ALTER TABLE orders_new RENAME TO orders;
        `);
        
        console.log('✅ orders table updated');
    }

} catch (error) {
    console.log('⚠️ DB Migration:', error.message);
}

console.log('✅ Database ready');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// ========== HELPER FUNCTIONS ==========

function getGuildSettings(guildId) {
    try {
        let settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
        if (!settings) {
            db.prepare(`INSERT INTO guild_settings (guild_id, created_at, allowed_roles, buy_title, buy_description, buy_color, buy_footer) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .run(guildId, Date.now(), JSON.stringify([]), 'Готовы сделать заказ?', 'Выберите киты из каналов ниже и нажмите открыть тикет.', '#5865F2', 'Shop System');
            settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
        }
        return settings;
    } catch (error) {
        console.error('Error getGuildSettings:', error);
        return null;
    }
}

function updateGuildSetting(guildId, key, value) {
    try {
        const validKeys = ['admin_role_id', 'buy_channel_id', 'notify_channel_id', 'log_channel_id', 'command_channel_id', 'kick_channel_id', 'category_id', 'welcome_channel_id', 'welcome_image_url', 'leave_image_url', 'allowed_roles', 'min_order_amount', 'buy_title', 'buy_description', 'buy_color', 'buy_footer'];
        if (!validKeys.includes(key)) return false;
        db.prepare(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
        return true;
    } catch (error) {
        console.error('Error updateGuildSetting:', error);
        return false;
    }
}

function isAdmin(member, guildId) {
    try {
        const settings = getGuildSettings(guildId);
        if (!settings) return false;
        if (!settings.admin_role_id) {
            return member.permissions.has(PermissionsBitField.Flags.Administrator);
        }
        return member.roles.cache.has(settings.admin_role_id);
    } catch (error) {
        console.error('Error isAdmin:', error);
        return false;
    }
}

function canUseBot(member, guildId) {
    try {
        const settings = getGuildSettings(guildId);
        if (!settings) return false;
        if (!settings.allowed_roles) return false;
        const allowedRoles = JSON.parse(settings.allowed_roles || '[]');
        if (allowedRoles.length === 0) return true;
        return member.roles.cache.some(role => allowedRoles.includes(role.id));
    } catch (error) {
        console.error('Error canUseBot:', error);
        return false;
    }
}

function getGuildProducts(guildId) {
    try {
        return db.prepare('SELECT * FROM guild_products WHERE guild_id = ? ORDER BY sort_order').all(guildId);
    } catch (error) {
        console.error('Error getGuildProducts:', error);
        return [];
    }
}

function getProduct(guildId, productId) {
    try {
        return db.prepare('SELECT * FROM guild_products WHERE guild_id = ? AND product_id = ?').get(guildId, productId);
    } catch (error) {
        console.error('Error getProduct:', error);
        return null;
    }
}

function addGuildProduct(guildId, product) {
    try {
        db.prepare(`
            INSERT INTO guild_products (guild_id, product_id, channel_id, name, price, image, description, category, sort_order, color)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(guildId, product.id, product.channelId, product.name, product.price, product.image || '', product.description || '', product.category || 'Общее', product.sortOrder || 0, product.color || '#5865F2');
        return true;
    } catch (error) {
        console.error('Error addGuildProduct:', error);
        return false;
    }
}

function updateGuildProduct(guildId, productId, data) {
    try {
        const { name, price, description, image, category, color } = data;
        db.prepare(`
            UPDATE guild_products
            SET name = ?, price = ?, description = ?, image = ?, category = ?, color = ?
            WHERE guild_id = ? AND product_id = ?
        `).run(name, price, description, image, category || 'Общее', color || '#5865F2', guildId, productId);
        return true;
    } catch (error) {
        console.error('Error updateGuildProduct:', error);
        return false;
    }
}

function removeGuildProduct(guildId, productId) {
    try {
        const product = getProduct(guildId, productId);
        if (product && product.message_id) {
            db.prepare('DELETE FROM messages WHERE guild_id = ? AND product_id = ?').run(guildId, productId);
        }
        db.prepare('DELETE FROM guild_products WHERE guild_id = ? AND product_id = ?').run(guildId, productId);
        return true;
    } catch (error) {
        console.error('Error removeGuildProduct:', error);
        return false;
    }
}

function getBasket(guildId, userId) {
    try {
        const rows = db.prepare('SELECT product_id, count FROM baskets WHERE guild_id = ? AND user_id = ?').all(guildId, userId);
        return new Map(rows.map(r => [r.product_id, r.count]));
    } catch (error) {
        console.error('Error getBasket:', error);
        return new Map();
    }
}

function setBasketItem(guildId, userId, productId, count) {
    try {
        if (count <= 0) {
            db.prepare('DELETE FROM baskets WHERE guild_id = ? AND user_id = ? AND product_id = ?').run(guildId, userId, productId);
        } else {
            db.prepare(`INSERT INTO baskets (guild_id, user_id, product_id, count) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id, product_id) DO UPDATE SET count = excluded.count`).run(guildId, userId, productId, count);
        }
        return true;
    } catch (error) {
        console.error('Error setBasketItem:', error);
        return false;
    }
}

function clearBasket(guildId, userId) {
    try {
        db.prepare('DELETE FROM baskets WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
        return true;
    } catch (error) {
        console.error('Error clearBasket:', error);
        return false;
    }
}

function getBasketTotal(guildId, basket) {
    try {
        let total = 0;
        for (const [id, count] of basket) {
            const prod = getProduct(guildId, id);
            if (prod) total += (parseInt(prod.price) || 0) * count;
        }
        return total;
    } catch (error) {
        console.error('Error getBasketTotal:', error);
        return 0;
    }
}

async function logNotification(guildId, embed) {
    try {
        const settings = getGuildSettings(guildId);
        if (!settings || !settings.log_channel_id) return;
        const channel = await client.channels.fetch(settings.log_channel_id);
        if (channel?.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.warn('Failed to send notification:', e.message);
    }
}

// ========== PRODUCT MESSAGE HANDLING ==========

async function ensureProductMessage(guildId, product) {
    const { channel_id: channelId, product_id: productId, name, price, description, image, color } = product;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased()) return;

        console.log(`Creating product message: ${productId} on guild ${guildId}`);

        const embed = new EmbedBuilder()
            .setTitle(name)
            .setDescription(`${description || ''}\nPrice: ${price} RUB`)
            .setColor(color || '#5865F2')
            .setImage(image?.trim() || '')
            .setFooter({ text: `Shop System • ${client.user.username}`, iconURL: client.user.displayAvatarURL() });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`dec:${productId}`)
                    .setLabel('-1')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`add:${productId}`)
                    .setLabel('+1')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`add5:${productId}`)
                    .setLabel('+5')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('basket')
                    .setLabel('Basket')
                    .setEmoji('🛒')
                    .setStyle(ButtonStyle.Secondary)
            );

        const stored = db.prepare('SELECT message_id FROM messages WHERE guild_id = ? AND channel_id = ? AND product_id = ?')
            .get(guildId, channelId, productId);

        if (stored) {
            try {
                const msg = await channel.messages.fetch(stored.message_id);
                await msg.edit({ embeds: [embed], components: [row] });
                console.log(`Updated message for ${productId}`);
                return;
            } catch {
                db.prepare('DELETE FROM messages WHERE guild_id = ? AND channel_id = ? AND product_id = ?')
                    .run(guildId, channelId, productId);
            }
        }

        const msg = await channel.send({ embeds: [embed], components: [row] });

        db.prepare(`INSERT INTO messages (guild_id, channel_id, product_id, message_id) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, channel_id, product_id) DO UPDATE SET message_id = excluded.message_id`)
            .run(guildId, channelId, productId, msg.id);

        console.log(`Message for ${productId} sent! (ID: ${msg.id})`);
    } catch (err) {
        console.error(`Error in channel ${channelId}:`, err.message);
    }
}

async function ensureBuyPrompt(guildId) {
    const settings = getGuildSettings(guildId);
    if (!settings || !settings.buy_channel_id) return;

    try {
        const channel = await client.channels.fetch(settings.buy_channel_id);
        if (!channel?.isTextBased()) return;

        const stored = db.prepare('SELECT message_id FROM messages WHERE guild_id = ? AND channel_id = ? AND product_id = ?')
            .get(guildId, settings.buy_channel_id, 'BUY_PROMPT');

        const title = settings.buy_title || 'Готовы сделать заказ?';
        const description = settings.buy_description || 'Выберите киты из каналов ниже и нажмите открыть тикет.';
        const color = settings.buy_color || '#5865F2';
        const footer = settings.buy_footer || 'Shop System';
        const minOrder = settings.min_order_amount || 50;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(`${description}\n\nMinimum: ${minOrder} RUB`)
            .setColor(color)
            .setFooter({ text: `${footer} • ${client.user.username}`, iconURL: client.user.displayAvatarURL() });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('start_order').setLabel('Open Ticket').setStyle(ButtonStyle.Success).setEmoji('💰')
            );

        if (stored) {
            try {
                const msg = await channel.messages.fetch(stored.message_id);
                await msg.edit({ embeds: [embed], components: [row] });
                console.log(`Updated "Buy" message in #${channel.name} (${guildId})`);
                return;
            } catch {
                db.prepare('DELETE FROM messages WHERE guild_id = ? AND channel_id = ? AND product_id = ?')
                    .run(guildId, settings.buy_channel_id, 'BUY_PROMPT');
            }
        }

        const msg = await channel.send({ embeds: [embed], components: [row] });

        db.prepare(`INSERT INTO messages (guild_id, channel_id, product_id, message_id) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, channel_id, product_id) DO UPDATE SET message_id = excluded.message_id`)
            .run(guildId, settings.buy_channel_id, 'BUY_PROMPT', msg.id);

        console.log(`"Buy" message sent to #${channel.name} (${guildId})`);
    } catch (err) {
        console.error('Error in buy channel:', err.message);
    }
}

// ========== MODAL BUILDERS ==========

function createWelcomeCustomizeModal() {
    const modal = new ModalBuilder()
        .setCustomId('welcome_customize_modal')
        .setTitle('Welcome Customization');

    const welcomeTitleInput = new TextInputBuilder()
        .setCustomId('welcome_title')
        .setLabel('Welcome Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Добро пожаловать!')
        .setRequired(false)
        .setMaxLength(100);

    const welcomeDescInput = new TextInputBuilder()
        .setCustomId('welcome_description')
        .setLabel('Welcome Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Привет, {user}!\nТы {count}-й участник!')
        .setRequired(false)
        .setMaxLength(500);

    const welcomeColorInput = new TextInputBuilder()
        .setCustomId('welcome_color')
        .setLabel('Welcome Color (HEX)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('#800080')
        .setRequired(false)
        .setMaxLength(7);

    modal.addComponents(
        new ActionRowBuilder().addComponents(welcomeTitleInput),
        new ActionRowBuilder().addComponents(welcomeDescInput),
        new ActionRowBuilder().addComponents(welcomeColorInput)
    );

    return modal;
}

function createLeaveCustomizeModal() {
    const modal = new ModalBuilder()
        .setCustomId('leave_customize_modal')
        .setTitle('Leave Customization');

    const leaveTitleInput = new TextInputBuilder()
        .setCustomId('leave_title')
        .setLabel('Leave Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('До свидания!')
        .setRequired(false)
        .setMaxLength(100);

    const leaveDescInput = new TextInputBuilder()
        .setCustomId('leave_description')
        .setLabel('Leave Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Прощай, {user}. Будем ждать!')
        .setRequired(false)
        .setMaxLength(500);

    const leaveColorInput = new TextInputBuilder()
        .setCustomId('leave_color')
        .setLabel('Leave Color (HEX)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('#800080')
        .setRequired(false)
        .setMaxLength(7);

    modal.addComponents(
        new ActionRowBuilder().addComponents(leaveTitleInput),
        new ActionRowBuilder().addComponents(leaveDescInput),
        new ActionRowBuilder().addComponents(leaveColorInput)
    );

    return modal;
}

function createEditProductModal(product) {
    const modal = new ModalBuilder()
        .setCustomId(`edit_product_${product.product_id}`)
        .setTitle(`Edit: ${product.name}`);

    const nameInput = new TextInputBuilder()
        .setCustomId('edit_name')
        .setLabel('Name')
        .setStyle(TextInputStyle.Short)
        .setValue(product.name)
        .setRequired(true);

    const priceInput = new TextInputBuilder()
        .setCustomId('edit_price')
        .setLabel('Price')
        .setStyle(TextInputStyle.Short)
        .setValue(product.price)
        .setRequired(true);

    const descInput = new TextInputBuilder()
        .setCustomId('edit_description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(product.description || '')
        .setRequired(false);

    const imageInput = new TextInputBuilder()
        .setCustomId('edit_image')
        .setLabel('Image URL')
        .setStyle(TextInputStyle.Short)
        .setValue(product.image || '')
        .setRequired(false);

    const colorInput = new TextInputBuilder()
        .setCustomId('edit_color')
        .setLabel('Color (HEX)')
        .setStyle(TextInputStyle.Short)
        .setValue(product.color || '#5865F2')
        .setRequired(false)
        .setMaxLength(7);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(priceInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(colorInput)
    );

    return modal;
}

// ========== COMMAND REGISTRATION ==========

client.once('clientReady', async () => {
    console.log(`${client.user.tag} is online`);
    console.log(`Bot on ${client.guilds.cache.size} servers`);

    const publicCommands = [
        { name: 'basket', description: 'Show your basket' },
        { name: 'products', description: 'Show all available products' },
        { name: 'help', description: 'Show command list' }
    ];

    const adminCommands = [
        {
            name: 'settings',
            description: 'Bot settings',
            options: [
                { name: 'show', description: 'Show current settings', type: 1 },
                { name: 'setadmin', description: 'Set admin role', type: 1, options: [{ name: 'role', description: 'Admin role', type: 8, required: true }] },
                { name: 'setbuy', description: 'Set buy channel', type: 1, options: [{ name: 'channel', description: 'Buy channel', type: 7, required: true }] },
                { name: 'setlog', description: 'Set log channel', type: 1, options: [{ name: 'channel', description: 'Log channel', type: 7, required: true }] },
                { name: 'setcommands', description: 'Set commands channel', type: 1, options: [{ name: 'channel', description: 'Commands channel', type: 7, required: true }] },
                { name: 'setkick', description: 'Set kick channel', type: 1, options: [{ name: 'channel', description: 'Kick channel', type: 7, required: true }] },
                { name: 'setcategory', description: 'Set ticket category', type: 1, options: [{ name: 'category', description: 'Ticket category', type: 7, required: true }] },
                { name: 'addrole', description: 'Add allowed role', type: 1, options: [{ name: 'role', description: 'Role', type: 8, required: true }] },
                { name: 'removerole', description: 'Remove allowed role', type: 1, options: [{ name: 'role', description: 'Role', type: 8, required: true }] },
                { name: 'setminorder', description: 'Set minimum order amount', type: 1, options: [{ name: 'amount', description: 'Amount in RUB', type: 4, required: true, min_value: 1, max_value: 10000 }] }
            ]
        },
        {
            name: 'product',
            description: 'Product management',
            options: [
                {
                    name: 'add',
                    description: 'Add new product',
                    type: 1,
                    options: [
                        { name: 'product_id', description: 'Unique product ID (e.g., PVP1)', type: 3, required: true, max_length: 10 },
                        { name: 'name', description: 'Product name', type: 3, required: true, max_length: 100 },
                        { name: 'price', description: 'Price in RUB', type: 3, required: true, max_length: 10 },
                        { name: 'channel_id', description: 'Channel ID to send to', type: 3, required: true, max_length: 20 },
                        { name: 'image', description: 'Image URL', type: 3, required: false, max_length: 200 },
                        { name: 'description', description: 'Product description', type: 3, required: false, max_length: 500 },
                        { name: 'color', description: 'Color (HEX) e.g., #5865F2', type: 3, required: false, max_length: 7 }
                    ]
                },
                { name: 'list', description: 'List products', type: 1 },
                { name: 'remove', description: 'Remove product', type: 1, options: [{ name: 'product_id', description: 'Product ID', type: 3, required: true }] },
                {
                    name: 'edit',
                    description: 'Edit product',
                    type: 1,
                    options: [
                        { name: 'product_id', description: 'Product ID', type: 3, required: true },
                        { name: 'name', description: 'New name', type: 3, required: false },
                        { name: 'price', description: 'New price', type: 3, required: false },
                        { name: 'image', description: 'New image URL', type: 3, required: false },
                        { name: 'description', description: 'New description', type: 3, required: false },
                        { name: 'color', description: 'New color (HEX)', type: 3, required: false }
                    ]
                },
                { name: 'fix', description: 'Fix product messages', type: 1 }
            ]
        },
        {
            name: 'welcome',
            description: 'Welcome/leave settings',
            options: [
                { name: 'setchannel', description: 'Set welcome channel', type: 1, options: [{ name: 'channel', description: 'Channel', type: 7, required: true }] },
                { name: 'setimage', description: 'Set welcome image', type: 1, options: [{ name: 'url', description: 'Image URL', type: 3, required: true }] },
                { name: 'setleaveimage', description: 'Set leave image', type: 1, options: [{ name: 'url', description: 'Image URL', type: 3, required: true }] },
                { name: 'enable', description: 'Enable/disable welcomes', type: 1, options: [{ name: 'enabled', description: 'Enabled', type: 5, required: true }] },
                { name: 'customize', description: 'Customize text', type: 1 }
            ]
        }
    ];

    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.commands.set(publicCommands);
            console.log(`Public commands registered for ${guild.name}`);

            for (const command of adminCommands) {
                await guild.commands.create(command);
            }
            console.log(`Admin commands registered for ${guild.name}`);

            getGuildSettings(guild.id);

        } catch (e) {
            console.error(`Error registering commands for ${guild.name}:`, e.message);
        }
    }

    client.user.setActivity(`/help | ${client.guilds.cache.size} servers`, { type: 3 });
});

// ========== INTERACTION HANDLERS ==========

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
            return;
        }

        if (!interaction.isChatInputCommand()) {
            if (interaction.isButton()) {
                await handleButtonClick(interaction);
            }
            return;
        }

        const guildId = interaction.guildId;
        if (!guildId) {
            return interaction.reply({ content: 'This command is only available on a server.', flags: 64 });
        }

        const commandName = interaction.commandName;

        if (['settings', 'product', 'welcome'].includes(commandName)) {
            if (!isAdmin(interaction.member, guildId)) {
                return interaction.reply({ content: 'This command is only available to admins!', flags: 64 });
            }
        }

        if (commandName === 'settings') {
            const subcommand = interaction.options.getSubcommand();
            const settings = getGuildSettings(guildId);

            if (!settings) {
                return interaction.reply({ content: '❌ Error loading server settings!', flags: 64 });
            }

            switch (subcommand) {
                case 'show': {
                    const embed = new EmbedBuilder()
                        .setTitle('Server Settings')
                        .setColor(0x5865F2)
                        .addFields(
                            { name: 'Admin Role', value: settings.admin_role_id ? `<@&${settings.admin_role_id}>` : 'Not set', inline: true },
                            { name: 'Buy Channel', value: settings.buy_channel_id ? `<#${settings.buy_channel_id}>` : 'Not set', inline: true },
                            { name: 'Log Channel', value: settings.log_channel_id ? `<#${settings.log_channel_id}>` : 'Not set', inline: true },
                            { name: 'Commands Channel', value: settings.command_channel_id ? `<#${settings.command_channel_id}>` : 'Not set', inline: true },
                            { name: 'Kick Channel', value: settings.kick_channel_id ? `<#${settings.kick_channel_id}>` : 'Not set', inline: true },
                            { name: 'Ticket Category', value: settings.category_id ? `<#${settings.category_id}>` : 'Not set', inline: true },
                            { name: 'Minimum Order', value: `${settings.min_order_amount || 50} RUB`, inline: true },
                            { name: 'Allowed Roles', value: settings.allowed_roles ? JSON.parse(settings.allowed_roles).map(r => `<@&${r}>`).join(', ') || 'All' : 'All', inline: false },
                            { name: 'Welcome Channel', value: settings.welcome_channel_id ? `<#${settings.welcome_channel_id}>` : 'Not set', inline: true },
                            { name: 'Buy Title', value: settings.buy_title || 'Готовы сделать заказ?', inline: false },
                            { name: 'Buy Color', value: settings.buy_color || '#5865F2', inline: true }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed] });
                    break;
                }
                case 'setadmin': {
                    const role = interaction.options.getRole('role');
                    updateGuildSetting(guildId, 'admin_role_id', role.id);
                    await interaction.reply({ content: `Admin role set: ${role}`, flags: 64 });
                    break;
                }
                case 'setbuy': {
                    const channel = interaction.options.getChannel('channel');
                    if (channel.type !== ChannelType.GuildText) {
                        return interaction.reply({ content: 'Must be a text channel!', flags: 64 });
                    }
                    
                    updateGuildSetting(guildId, 'buy_channel_id', channel.id);
                    
                    const modal = new ModalBuilder()
                        .setCustomId('setbuy_modal')
                        .setTitle('Buy Channel Settings');

                    const titleInput = new TextInputBuilder()
                        .setCustomId('buy_title')
                        .setLabel('Title')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Готовы сделать заказ?')
                        .setRequired(false)
                        .setMaxLength(100);

                    const descInput = new TextInputBuilder()
                        .setCustomId('buy_description')
                        .setLabel('Description')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Выберите киты из каналов ниже и нажмите открыть тикет.')
                        .setRequired(false)
                        .setMaxLength(500);

                    const colorInput = new TextInputBuilder()
                        .setCustomId('buy_color')
                        .setLabel('Color (HEX)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('#5865F2')
                        .setRequired(false)
                        .setMaxLength(7);

                    const footerInput = new TextInputBuilder()
                        .setCustomId('buy_footer')
                        .setLabel('Footer')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Shop System')
                        .setRequired(false)
                        .setMaxLength(50);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(titleInput),
                        new ActionRowBuilder().addComponents(descInput),
                        new ActionRowBuilder().addComponents(colorInput),
                        new ActionRowBuilder().addComponents(footerInput)
                    );

                    await interaction.showModal(modal);
                    break;
                }
                case 'setlog': {
                    const channel = interaction.options.getChannel('channel');
                    if (channel.type !== ChannelType.GuildText) return interaction.reply({ content: 'Must be a text channel!', flags: 64 });
                    updateGuildSetting(guildId, 'log_channel_id', channel.id);
                    await interaction.reply({ content: `Log channel set: ${channel}`, flags: 64 });
                    break;
                }
                case 'setcommands': {
                    const channel = interaction.options.getChannel('channel');
                    if (channel.type !== ChannelType.GuildText) return interaction.reply({ content: 'Must be a text channel!', flags: 64 });
                    updateGuildSetting(guildId, 'command_channel_id', channel.id);
                    await interaction.reply({ content: `Commands channel set: ${channel}`, flags: 64 });
                    break;
                }
                case 'setkick': {
                    const channel = interaction.options.getChannel('channel');
                    if (channel.type !== ChannelType.GuildText) return interaction.reply({ content: 'Must be a text channel!', flags: 64 });
                    updateGuildSetting(guildId, 'kick_channel_id', channel.id);
                    await interaction.reply({ content: `Kick channel set: ${channel}`, flags: 64 });
                    break;
                }
                case 'setcategory': {
                    const channel = interaction.options.getChannel('category');
                    if (channel.type !== ChannelType.GuildCategory) return interaction.reply({ content: 'Must be a category!', flags: 64 });
                    updateGuildSetting(guildId, 'category_id', channel.id);
                    await interaction.reply({ content: `Ticket category set: ${channel}`, flags: 64 });
                    break;
                }
                case 'addrole': {
                    const role = interaction.options.getRole('role');
                    const settings = getGuildSettings(guildId);
                    const allowedRoles = JSON.parse(settings.allowed_roles || '[]');
                    if (allowedRoles.includes(role.id)) return interaction.reply({ content: `Role ${role} already added`, flags: 64 });
                    allowedRoles.push(role.id);
                    updateGuildSetting(guildId, 'allowed_roles', JSON.stringify(allowedRoles));
                    await interaction.reply({ content: `Role ${role} added to allowed roles`, flags: 64 });
                    break;
                }
                case 'removerole': {
                    const role = interaction.options.getRole('role');
                    const settings = getGuildSettings(guildId);
                    const allowedRoles = JSON.parse(settings.allowed_roles || '[]');
                    const index = allowedRoles.indexOf(role.id);
                    if (index === -1) return interaction.reply({ content: `Role ${role} not found`, flags: 64 });
                    allowedRoles.splice(index, 1);
                    updateGuildSetting(guildId, 'allowed_roles', JSON.stringify(allowedRoles));
                    await interaction.reply({ content: `Role ${role} removed from allowed roles`, flags: 64 });
                    break;
                }
                case 'setminorder': {
                    const amount = interaction.options.getInteger('amount');
                    updateGuildSetting(guildId, 'min_order_amount', amount);
                    await interaction.reply({ content: `Minimum order amount: ${amount} RUB`, flags: 64 });
                    break;
                }
                default: {
                    return interaction.reply({ content: '❌ Unknown subcommand!', flags: 64 });
                }
            }
            return;
        }

        if (commandName === 'product') {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'add': {
                    try {
                        const productId = interaction.options.getString('product_id').toUpperCase().trim();
                        const name = interaction.options.getString('name').trim();
                        const price = interaction.options.getString('price').trim();
                        const channelId = interaction.options.getString('channel_id').trim();
                        const image = interaction.options.getString('image')?.trim() || '';
                        const description = interaction.options.getString('description')?.trim() || '';
                        const color = interaction.options.getString('color')?.trim() || '#5865F2';

                        const colorRegex = /^#[0-9A-Fa-f]{6}$/;
                        const finalColor = colorRegex.test(color) ? color : '#5865F2';

                        if (!channelId.match(/^\d+$/)) {
                            return interaction.reply({ content: '❌ Channel ID must contain only numbers!', flags: 64 });
                        }

                        if (!productId || !name || !price) {
                            return interaction.reply({ content: '❌ Fill in ID, Name, and Price!', flags: 64 });
                        }

                        const existing = getProduct(guildId, productId);
                        if (existing) {
                            return interaction.reply({ content: `❌ Product with ID "${productId}" already exists!`, flags: 64 });
                        }

                        const channel = await client.channels.fetch(channelId).catch(() => null);
                        if (!channel) {
                            return interaction.reply({ content: `❌ Channel with ID "${channelId}" not found!`, flags: 64 });
                        }

                        addGuildProduct(guildId, {
                            id: productId,
                            name: name,
                            price: price,
                            description: description,
                            image: image,
                            channelId: channelId,
                            category: 'General',
                            color: finalColor
                        });

                        const product = getProduct(guildId, productId);
                        if (product) {
                            await ensureProductMessage(guildId, product);
                        }

                        const embed = new EmbedBuilder()
                            .setTitle('✅ Product Added')
                            .setColor(0x00FF00)
                            .addFields(
                                { name: 'ID', value: productId, inline: true },
                                { name: 'Name', value: name, inline: true },
                                { name: 'Price', value: `${price} RUB`, inline: true },
                                { name: 'Channel', value: `${channel}`, inline: false },
                                { name: 'Description', value: description || 'None', inline: false }
                            )
                            .setTimestamp();

                        if (image) {
                            embed.setImage(image);
                        }

                        await interaction.reply({ embeds: [embed] });
                    } catch (error) {
                        console.error('Error adding product:', error);
                        await interaction.reply({ content: `❌ Error: ${error.message}`, flags: 64 });
                    }
                    break;
                }
                case 'list': {
                    const products = getGuildProducts(guildId);
                    if (products.length === 0) return interaction.reply({ content: '📭 No products on this server.', flags: 64 });

                    const embed = new EmbedBuilder()
                        .setTitle('📦 Server Products')
                        .setColor(0x5865F2)
                        .setDescription(products.map(p =>
                            `**${p.name}** (${p.product_id})\n` +
                            `💰 ${p.price} RUB\n` +
                            `${p.description ? `📝 ${p.description}\n` : ''}` +
                            `🎨 Color: ${p.color || '#5865F2'}\n` +
                            `📎 <#${p.channel_id}>`
                        ).join('\n\n'))
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed] });
                    break;
                }
                case 'remove': {
                    const productId = interaction.options.getString('product_id').toUpperCase();
                    const product = getProduct(guildId, productId);
                    if (!product) return interaction.reply({ content: `❌ Product with ID "${productId}" not found`, flags: 64 });

                    removeGuildProduct(guildId, productId);
                    await interaction.reply({ content: `✅ Product "${product.name}" removed`, flags: 64 });
                    break;
                }
                case 'edit': {
                    const productId = interaction.options.getString('product_id').toUpperCase();
                    const product = getProduct(guildId, productId);
                    if (!product) return interaction.reply({ content: `❌ Product with ID "${productId}" not found`, flags: 64 });

                    const name = interaction.options.getString('name') || product.name;
                    const price = interaction.options.getString('price') || product.price;
                    const image = interaction.options.getString('image') || product.image || '';
                    const description = interaction.options.getString('description') || product.description || '';
                    const color = interaction.options.getString('color') || product.color || '#5865F2';

                    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
                    const finalColor = colorRegex.test(color) ? color : '#5865F2';

                    updateGuildProduct(guildId, productId, { name, price, description, image, color: finalColor });

                    const updatedProduct = getProduct(guildId, productId);
                    if (updatedProduct) {
                        await ensureProductMessage(guildId, updatedProduct);
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('✅ Product Updated')
                        .setColor(0x5865F2)
                        .addFields(
                            { name: 'ID', value: productId, inline: true },
                            { name: 'Name', value: name, inline: true },
                            { name: 'Price', value: `${price} RUB`, inline: true }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed] });
                    break;
                }
                case 'fix': {
                    const products = getGuildProducts(guildId);
                    if (products.length === 0) return interaction.reply({ content: '📭 No products to fix.', flags: 64 });

                    await interaction.reply({ content: `🔄 Recreating messages for ${products.length} products...`, flags: 64 });

                    for (const product of products) {
                        await ensureProductMessage(guildId, product);
                    }

                    await interaction.editReply({ content: `✅ Messages for all products updated!` });
                    break;
                }
                default: {
                    return interaction.reply({ content: '❌ Unknown subcommand!', flags: 64 });
                }
            }
            return;
        }

        if (commandName === 'welcome') {
            const subcommand = interaction.options.getSubcommand();
            const settings = getGuildSettings(guildId);

            if (!settings) {
                return interaction.reply({ content: '❌ Error loading server settings!', flags: 64 });
            }

            switch (subcommand) {
                case 'setchannel': {
                    const channel = interaction.options.getChannel('channel');
                    if (channel.type !== ChannelType.GuildText) return interaction.reply({ content: 'Must be a text channel!', flags: 64 });
                    updateGuildSetting(guildId, 'welcome_channel_id', channel.id);
                    await interaction.reply({ content: `Welcome channel set: ${channel}`, flags: 64 });
                    break;
                }
                case 'setimage': {
                    const url = interaction.options.getString('url');
                    if (!url.match(/^https?:\/\/[^\s]+$/)) return interaction.reply({ content: 'Must be a valid URL', flags: 64 });
                    updateGuildSetting(guildId, 'welcome_image_url', url);
                    await interaction.reply({ content: 'Welcome image updated', flags: 64 });
                    break;
                }
                case 'setleaveimage': {
                    const url = interaction.options.getString('url');
                    if (!url.match(/^https?:\/\/[^\s]+$/)) return interaction.reply({ content: 'Must be a valid URL', flags: 64 });
                    updateGuildSetting(guildId, 'leave_image_url', url);
                    await interaction.reply({ content: 'Leave image updated', flags: 64 });
                    break;
                }
                case 'enable': {
                    const enabled = interaction.options.getBoolean('enabled');
                    db.prepare(`INSERT INTO welcome_settings (guild_id, enabled) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`).run(guildId, enabled ? 1 : 0);
                    await interaction.reply({ content: `Welcomes ${enabled ? 'enabled' : 'disabled'}`, flags: 64 });
                    break;
                }
                case 'customize': {
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('customize_welcome')
                                .setLabel('Customize Welcome')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('customize_leave')
                                .setLabel('Customize Leave')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    await interaction.reply({
                        content: 'What do you want to customize?',
                        components: [row],
                        flags: 64
                    });
                    break;
                }
                default: {
                    return interaction.reply({ content: '❌ Unknown subcommand!', flags: 64 });
                }
            }
            return;
        }

        if (!canUseBot(interaction.member, guildId)) {
            return interaction.reply({ content: 'You don\'t have permission to use the bot!', flags: 64 });
        }

        switch (commandName) {
            case 'basket': {
                const basket = getBasket(guildId, interaction.user.id);
                if (basket.size === 0) return interaction.reply({ content: 'Basket is empty.', flags: 64 });

                const total = getBasketTotal(guildId, basket);
                const lines = Array.from(basket).map(([id, c]) => {
                    const p = getProduct(guildId, id);
                    return p ? `${p.name} x${c}` : '';
                }).filter(Boolean);

                const embed = new EmbedBuilder()
                    .setTitle('Your Basket')
                    .setDescription(lines.join('\n') || '—')
                    .setFooter({ text: `Total: ${total} RUB` })
                    .setColor(0x5865F2);

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('clear_basket')
                            .setLabel('Clear All')
                            .setStyle(ButtonStyle.Danger)
                    );

                await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
                break;
            }
            case 'products': {
                const products = getGuildProducts(guildId);
                if (products.length === 0) return interaction.reply({ content: 'No products available on this server.', flags: 64 });

                const embed = new EmbedBuilder()
                    .setTitle('Available Products')
                    .setColor(0x5865F2)
                    .setDescription(products.map(p =>
                        `${p.name} (${p.product_id})\n` +
                        `${p.price} RUB\n` +
                        `${p.description ? p.description + '\n' : ''}`
                    ).join('\n\n'))
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                break;
            }
            case 'help': {
                const isAdminUser = isAdmin(interaction.member, guildId);
                const embed = new EmbedBuilder()
                    .setTitle('Command Help')
                    .setColor(0x5865F2)
                    .addFields({
                        name: '👤 User Commands',
                        value: '/basket - Show your basket\n/products - Show all products\n/help - Show this message',
                        inline: false
                    });

                if (isAdminUser) {
                    embed.addFields(
                        { name: '⚙️ Settings (/settings)', value: '/settings show - Show settings\n/settings setadmin @role - Admin role\n/settings setbuy #channel - Buy channel\n/settings setlog #channel - Log channel\n/settings setcommands #channel - Commands channel\n/settings setkick #channel - Kick channel\n/settings setcategory #category - Ticket category\n/settings addrole @role - Add role\n/settings removerole @role - Remove role\n/settings setminorder 50 - Min order amount', inline: false },
                        { name: '📦 Products (/product)', value: '/product add - Add product\n/product list - List products\n/product remove ID - Remove product\n/product edit ID - Edit product\n/product fix - Fix messages', inline: false },
                        { name: '🎨 Welcome (/welcome)', value: '/welcome setchannel #channel - Channel\n/welcome setimage url - Welcome image\n/welcome setleaveimage url - Leave image\n/welcome enable true/false - Enable/disable\n/welcome customize - Customize text', inline: false }
                    );
                }

                await interaction.reply({ embeds: [embed] });
                break;
            }
            default: {
                return interaction.reply({ content: '❌ Unknown command!', flags: 64 });
            }
        }
    } catch (error) {
        console.error('Error in interactionCreate:', error);
        try {
            await interaction.reply({
                content: `❌ An error occurred: ${error.message}`,
                flags: 64
            });
        } catch (e) {
            console.error('Could not send error message:', e);
        }
    }
});

// ========== MODAL SUBMIT HANDLER ==========

async function handleModalSubmit(interaction) {
    try {
        const guildId = interaction.guildId;

        if (interaction.customId === 'setbuy_modal') {
            try {
                const title = interaction.fields.getTextInputValue('buy_title')?.trim() || 'Готовы сделать заказ?';
                const description = interaction.fields.getTextInputValue('buy_description')?.trim() || 'Выберите киты из каналов ниже и нажмите открыть тикет.';
                const color = interaction.fields.getTextInputValue('buy_color')?.trim() || '#5865F2';
                const footer = interaction.fields.getTextInputValue('buy_footer')?.trim() || 'Shop System';

                const colorRegex = /^#[0-9A-Fa-f]{6}$/;
                const finalColor = colorRegex.test(color) ? color : '#5865F2';

                updateGuildSetting(guildId, 'buy_title', title);
                updateGuildSetting(guildId, 'buy_description', description);
                updateGuildSetting(guildId, 'buy_color', finalColor);
                updateGuildSetting(guildId, 'buy_footer', footer);

                await ensureBuyPrompt(guildId);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Buy Channel Settings Updated!')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: 'Title', value: title, inline: false },
                        { name: 'Description', value: description, inline: false },
                        { name: 'Color', value: finalColor, inline: true },
                        { name: 'Footer', value: footer, inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: 64 });
            } catch (error) {
                console.error('Error setting buy channel:', error);
                await interaction.reply({ content: `❌ Error: ${error.message}`, flags: 64 });
            }
            return;
        }

        if (interaction.customId === 'welcome_customize_modal') {
            try {
                const title = interaction.fields.getTextInputValue('welcome_title')?.trim() || 'Добро пожаловать!';
                const description = interaction.fields.getTextInputValue('welcome_description')?.trim() || 'Привет, {user}!\nТы {count}-й участник сервера!';
                const color = interaction.fields.getTextInputValue('welcome_color')?.trim() || '#800080';

                const colorRegex = /^#[0-9A-Fa-f]{6}$/;
                const finalColor = colorRegex.test(color) ? color : '#800080';

                db.prepare(`
                    INSERT INTO welcome_settings (guild_id, welcome_title, welcome_description, welcome_color)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(guild_id) DO UPDATE SET
                        welcome_title = excluded.welcome_title,
                        welcome_description = excluded.welcome_description,
                        welcome_color = excluded.welcome_color
                `).run(guildId, title, description, finalColor);

                const settings = getGuildSettings(guildId);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Welcome Settings Updated!')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: 'Title', value: title, inline: false },
                        { name: 'Description', value: description.replace(/{user}/g, '@example').replace(/{count}/g, '42'), inline: false },
                        { name: 'Color', value: finalColor, inline: true },
                        { name: 'Channel', value: settings.welcome_channel_id ? `<#${settings.welcome_channel_id}>` : 'Not set!', inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: 64 });
            } catch (error) {
                console.error('Error customizing welcome:', error);
                await interaction.reply({ content: `Error: ${error.message}`, flags: 64 });
            }
            return;
        }

        if (interaction.customId === 'leave_customize_modal') {
            try {
                const title = interaction.fields.getTextInputValue('leave_title')?.trim() || 'До свидания!';
                const description = interaction.fields.getTextInputValue('leave_description')?.trim() || 'Прощай, {user}. Будем ждать тебя снова!';
                const color = interaction.fields.getTextInputValue('leave_color')?.trim() || '#800080';

                const colorRegex = /^#[0-9A-Fa-f]{6}$/;
                const finalColor = colorRegex.test(color) ? color : '#800080';

                db.prepare(`
                    INSERT INTO welcome_settings (guild_id, leave_title, leave_description, leave_color)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(guild_id) DO UPDATE SET
                        leave_title = excluded.leave_title,
                        leave_description = excluded.leave_description,
                        leave_color = excluded.leave_color
                `).run(guildId, title, description, finalColor);

                const settings = getGuildSettings(guildId);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Leave Settings Updated!')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: 'Title', value: title, inline: false },
                        { name: 'Description', value: description.replace(/{user}/g, '@example'), inline: false },
                        { name: 'Color', value: finalColor, inline: true },
                        { name: 'Channel', value: settings.welcome_channel_id ? `<#${settings.welcome_channel_id}>` : 'Not set!', inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: 64 });
            } catch (error) {
                console.error('Error customizing leave:', error);
                await interaction.reply({ content: `Error: ${error.message}`, flags: 64 });
            }
            return;
        }

        if (interaction.customId === 'order_modal') {
            try {
                const user = interaction.user;
                const basket = getBasket(guildId, user.id);
                const total = getBasketTotal(guildId, basket);
                const settings = getGuildSettings(guildId);
                
                if (!settings) {
                    return interaction.reply({
                        content: '❌ Error loading server settings!',
                        flags: 64
                    });
                }

                const minOrder = settings.min_order_amount || 50;

                if (total < minOrder) {
                    return interaction.reply({ content: `Minimum order is ${minOrder} RUB. You have: ${total} RUB.`, flags: 64 });
                }

                if (!settings.category_id) {
                    return interaction.reply({
                        content: '❌ Admin hasn\'t set a ticket category!\nUse: `/settings setcategory #category`',
                        flags: 64
                    });
                }

                if (!settings.admin_role_id) {
                    return interaction.reply({
                        content: '❌ Admin hasn\'t set an admin role!\nUse: `/settings setadmin @role`',
                        flags: 64
                    });
                }

                try {
                    const category = await client.channels.fetch(settings.category_id);
                    if (!category || category.type !== ChannelType.GuildCategory) {
                        return interaction.reply({
                            content: '❌ Ticket category not found!\nCheck settings: `/settings show`',
                            flags: 64
                        });
                    }
                } catch (e) {
                    return interaction.reply({
                        content: '❌ Ticket category not found!\nCheck settings: `/settings show`',
                        flags: 64
                    });
                }

                const nickname = interaction.fields.getTextInputValue('nickname');
                const paymentMethod = interaction.fields.getTextInputValue('payment_method');
                const deliveryMethod = interaction.fields.getTextInputValue('delivery_method');
                const coordinates = interaction.fields.getTextInputValue('coordinates');
                const dimension = interaction.fields.getTextInputValue('dimension');

                if (!nickname || !paymentMethod || !deliveryMethod || !coordinates || !dimension) {
                    return interaction.reply({
                        content: 'Fill in all form fields!',
                        flags: 64
                    });
                }

                const guild = await client.guilds.fetch(guildId);
                const categoryId = settings.category_id;

                const channelName = `order-${user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`.slice(0, 32);

                const orderChannel = await guild.channels.create({
                    name: channelName,
                    type: 0,
                    parent: categoryId || undefined,
                    permissionOverwrites: [
                        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
                    ]
                });

                if (settings.admin_role_id) {
                    await orderChannel.permissionOverwrites.create(settings.admin_role_id, {
                        ViewChannel: true,
                        SendMessages: true
                    }, { type: 0 }).catch(() => {});
                }

                const orderData = JSON.stringify({
                    nickname,
                    paymentMethod,
                    deliveryMethod,
                    coordinates,
                    dimension,
                    items: Array.from(basket).map(([id, count]) => {
                        const prod = getProduct(guildId, id);
                        return { name: prod?.name || id, count, price: prod?.price || '0' };
                    })
                });

                db.prepare('INSERT OR REPLACE INTO orders (guild_id, user_id, channel_id, created_at, order_data, total) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(guildId, user.id, orderChannel.id, Date.now(), orderData, total);

                const logEmbed = new EmbedBuilder()
                    .setTitle('🆕 New Order')
                    .setDescription(`<@${user.id}> opened a ticket`)
                    .addFields(
                        { name: '📌 Channel', value: `${orderChannel}`, inline: true },
                        { name: '💰 Amount', value: `${total} RUB`, inline: true },
                        { name: '📦 Items', value: `${basket.size} pcs`, inline: true }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({ text: `Order ID: ${orderChannel.id}`, iconURL: client.user.displayAvatarURL() });

                await logNotification(guildId, logEmbed);

                const lines = [];
                for (const [id, count] of basket) {
                    const prod = getProduct(guildId, id);
                    if (prod) lines.push(`${prod.name} x${count} (${prod.price} RUB)`);
                }

                const embed = new EmbedBuilder()
                    .setTitle('Order from ' + user.username)
                    .setDescription(lines.join('\n') || 'Empty')
                    .addFields(
                        { name: 'In-game Nick', value: nickname || 'Not specified', inline: true },
                        { name: 'Payment Method', value: paymentMethod || 'Not specified', inline: true },
                        { name: 'Delivery Method', value: deliveryMethod || 'Not specified', inline: true },
                        { name: 'Coordinates', value: coordinates || 'Not specified', inline: true },
                        { name: 'Dimension', value: dimension || 'Not specified', inline: true }
                    )
                    .setColor(0x5865F2)
                    .setFooter({ text: `Total: ${total} RUB` })
                    .setTimestamp();

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_order').setLabel('Close Order').setStyle(ButtonStyle.Danger)
                );

                const adminMention = settings.admin_role_id ? `<@&${settings.admin_role_id}>` : 'administrators';
                await orderChannel.send({
                    content: `<@${user.id}>, ${adminMention}, order created!`,
                    embeds: [embed],
                    components: [closeRow]
                });

                clearBasket(guildId, user.id);

                await interaction.reply({
                    content: `✅ Your ticket is ready: ${orderChannel}\nAdministrators have been notified.`,
                    flags: 64
                });

                console.log(`Ticket created for ${user.tag} on guild ${guild.name}`);
            } catch (error) {
                console.error('Error creating order:', error);
                await interaction.reply({
                    content: `❌ Error: ${error.message}`,
                    flags: 64
                });
            }
            return;
        }

        await interaction.reply({
            content: '❌ Unknown modal!',
            flags: 64
        });

    } catch (error) {
        console.error('Error in handleModalSubmit:', error);
        try {
            await interaction.reply({
                content: `❌ An error occurred: ${error.message}`,
                flags: 64
            });
        } catch (e) {
            console.error('Could not send error message:', e);
        }
    }
}

// ========== BUTTON CLICK HANDLER ==========

async function handleButtonClick(interaction) {
    try {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        try {
            await interaction.channel.fetch();
        } catch (e) {
            console.log('⚠️ Channel unavailable, skipping');
            return;
        }

        if (interaction.customId === 'clear_basket') {
            clearBasket(guildId, userId);
            try {
                await interaction.update({ content: 'Basket cleared', embeds: [], components: [] });
            } catch (e) {
                console.log('⚠️ Could not update message:', e.message);
                try {
                    await interaction.reply({ content: 'Basket cleared', flags: 64 });
                } catch (e2) {}
            }
            return;
        }

        if (interaction.customId.startsWith('add:') || interaction.customId.startsWith('dec:') || interaction.customId.startsWith('add5:')) {
            const productId = interaction.customId.split(':')[1];

            console.log(`Button clicked: ${interaction.customId}`);
            console.log(`Product ID: "${productId}"`);

            const allProducts = getGuildProducts(guildId);
            console.log(`All products on server:`, allProducts.map(p => `"${p.product_id}"`).join(', '));

            const product = getProduct(guildId, productId);

            if (!product) {
                const productList = allProducts.map(p => `\`${p.product_id}\``).join(', ') || 'no products';

                try {
                    await interaction.reply({
                        content: `❌ Product "${productId}" not found!\n` +
                            `Available products: ${productList}\n` +
                            `Use /product list to view.`,
                        flags: 64
                    });
                } catch (e) {
                    console.log('⚠️ Could not send reply:', e.message);
                }
                return;
            }

            const basket = getBasket(guildId, userId);
            const cur = basket.get(productId) || 0;

            let delta = 0;
            if (interaction.customId.startsWith('add:')) delta = 1;
            else if (interaction.customId.startsWith('add5:')) delta = 5;
            else if (interaction.customId.startsWith('dec:')) delta = -1;

            const cnt = Math.max(0, cur + delta);
            setBasketItem(guildId, userId, productId, cnt);

            let msg = '';
            if (cnt === 0) {
                msg = `${product.name} removed`;
            } else if (delta === 5) {
                msg = `+5 ${product.name} → ${cnt} pcs`;
            } else {
                msg = `${delta > 0 ? '+' : '-'}1 ${product.name} → ${cnt} pcs`;
            }

            try {
                await interaction.reply({ content: msg, flags: 64 });
            } catch (e) {
                console.log('⚠️ Could not send reply:', e.message);
            }
            return;
        }

        if (interaction.customId === 'basket') {
            const basket = getBasket(guildId, userId);
            if (basket.size === 0) {
                try {
                    await interaction.reply({ content: 'Basket is empty.', flags: 64 });
                } catch (e) {}
                return;
            }

            const total = getBasketTotal(guildId, basket);
            const lines = Array.from(basket).map(([id, c]) => {
                const p = getProduct(guildId, id);
                return p ? `${p.name} x${c}` : '';
            }).filter(Boolean);

            const embed = new EmbedBuilder()
                .setTitle('Your Basket')
                .setDescription(lines.join('\n') || '—')
                .setFooter({ text: `Total: ${total} RUB` })
                .setColor(0x5865F2);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('clear_basket')
                        .setLabel('Clear All')
                        .setStyle(ButtonStyle.Danger)
                );

            try {
                await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
            } catch (e) {
                console.log('⚠️ Could not send basket:', e.message);
            }
            return;
        }

        if (interaction.customId === 'start_order') {
            const settings = getGuildSettings(guildId);
            
            if (!settings) {
                try {
                    await interaction.reply({
                        content: '❌ Error loading server settings!',
                        flags: 64
                    });
                } catch (e) {}
                return;
            }

            const basket = getBasket(guildId, userId);
            const total = getBasketTotal(guildId, basket);
            const minOrder = settings.min_order_amount || 50;

            if (total < minOrder) {
                try {
                    await interaction.reply({
                        content: `Minimum order is ${minOrder} RUB. You have: ${total} RUB.`,
                        flags: 64
                    });
                } catch (e) {}
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId('order_modal')
                .setTitle('Order Confirmation');

            const nicknameInput = new TextInputBuilder()
                .setCustomId('nickname')
                .setLabel('Your in-game nickname')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., K1GC')
                .setRequired(true)
                .setMaxLength(32);

            const paymentInput = new TextInputBuilder()
                .setCustomId('payment_method')
                .setLabel('Payment Method')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('FUNPay / Crypto / Cards')
                .setRequired(true)
                .setMaxLength(100);

            const deliveryInput = new TextInputBuilder()
                .setCustomId('delivery_method')
                .setLabel('Delivery Method')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Stash / Hand-to-hand')
                .setRequired(true)
                .setMaxLength(50);

            const coordsInput = new TextInputBuilder()
                .setCustomId('coordinates')
                .setLabel('Coordinates (X Y Z)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('100 64 -200')
                .setRequired(true)
                .setMaxLength(50);

            const dimensionInput = new TextInputBuilder()
                .setCustomId('dimension')
                .setLabel('Dimension')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Nether / End / Overworld')
                .setRequired(true)
                .setMaxLength(50);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nicknameInput),
                new ActionRowBuilder().addComponents(paymentInput),
                new ActionRowBuilder().addComponents(deliveryInput),
                new ActionRowBuilder().addComponents(coordsInput),
                new ActionRowBuilder().addComponents(dimensionInput)
            );

            try {
                await interaction.showModal(modal);
            } catch (e) {
                console.log('⚠️ Could not show modal:', e.message);
            }
            return;
        }

        if (interaction.customId === 'close_order') {
            const order = db.prepare('SELECT * FROM orders WHERE guild_id = ? AND channel_id = ?')
                .get(guildId, interaction.channelId);

            if (!order) {
                try {
                    await interaction.reply({ content: 'This is not an order channel.', flags: 64 });
                } catch (e) {}
                return;
            }

            if (!isAdmin(interaction.member, guildId)) {
                try {
                    await interaction.reply({ content: 'Only admins can close orders.', flags: 64 });
                } catch (e) {}
                return;
            }

            let orderData = {};
            let items = [];
            let total = order.total || 0;
            let buyerId = order.user_id;

            if (order.order_data) {
                try {
                    orderData = JSON.parse(order.order_data);
                    items = orderData.items || [];
                    total = order.total || 0;
                } catch (e) {
                    console.error('Error parsing order_data:', e);
                }
            }

            let buyerName = 'Unknown';
            try {
                const buyer = await client.users.fetch(buyerId);
                buyerName = buyer.username;
            } catch (e) {}

            const embed = new EmbedBuilder()
                .setTitle('Completed Order')
                .setColor(0x00FF00)
                .setTimestamp()
                .setFooter({ text: `Closed by: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

            embed.addFields({
                name: 'Buyer',
                value: `<@${buyerId}> #${buyerId} /${buyerName || 'Unknown'}`,
                inline: false
            });

            let itemsList = '';
            for (const item of items) {
                const product = getProduct(guildId, item.name);
                const color = product?.color || '#5865F2';
                itemsList += `- ${item.name} - x${item.count}\n`;
            }

            if (itemsList) {
                embed.addFields({
                    name: 'Items',
                    value: itemsList || 'No items',
                    inline: false
                });
            }

            embed.addFields({
                name: 'Total Amount',
                value: `${total} RUB`,
                inline: false
            });

            if (orderData.paymentMethod) {
                embed.addFields({
                    name: 'Payment Method',
                    value: orderData.paymentMethod,
                    inline: true
                });
            }

            if (orderData.deliveryMethod) {
                embed.addFields({
                    name: 'Delivery Method',
                    value: orderData.deliveryMethod,
                    inline: true
                });
            }

            if (orderData.coordinates) {
                embed.addFields({
                    name: 'Coordinates',
                    value: orderData.coordinates,
                    inline: false
                });
            }

            if (orderData.dimension) {
                embed.addFields({
                    name: 'Dimension',
                    value: orderData.dimension,
                    inline: false
                });
            }

            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('confirm_close:yes').setLabel('Yes, Close').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('confirm_close:no').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                );

            try {
                await interaction.reply({
                    embeds: [embed],
                    components: [confirmRow]
                });

                setTimeout(() => {
                    interaction.deleteReply().catch(() => {});
                }, 60000);
            } catch (e) {
                console.log('⚠️ Could not send confirmation:', e.message);
            }
            return;
        }

        if (interaction.customId.startsWith('confirm_close:')) {
            const action = interaction.customId.split(':')[1];
            const order = db.prepare('SELECT * FROM orders WHERE guild_id = ? AND channel_id = ?')
                .get(guildId, interaction.channelId);

            if (!order) {
                try {
                    await interaction.update({ content: 'Ticket already closed.', embeds: [], components: [] });
                } catch (e) {}
                return;
            }

            if (!isAdmin(interaction.member, guildId)) {
                try {
                    await interaction.update({ content: 'You don\'t have permission', embeds: [], components: [] });
                } catch (e) {}
                return;
            }

            if (action === 'yes') {
                let orderData = {};
                let items = [];
                let total = order.total || 0;
                let buyerId = order.user_id;

                if (order.order_data) {
                    try {
                        orderData = JSON.parse(order.order_data);
                        items = orderData.items || [];
                    } catch (e) {}
                }

                let buyerName = 'Unknown';
                try {
                    const buyer = await client.users.fetch(buyerId);
                    buyerName = buyer.username;
                } catch (e) {}

                let itemsList = '';
                for (const item of items) {
                    const product = getProduct(guildId, item.name);
                    const color = product?.color || '#5865F2';
                    itemsList += `- ${item.name} x${item.count}\n`;
                }

                const logEmbed = new EmbedBuilder()
                    .setTitle('🔒 Order Closed')
                    .setDescription(`Ticket ${interaction.channel.name} closed`)
                    .addFields(
                        { 
                            name: '👤 Order Info', 
                            value: 
                                `**Nickname:** ${orderData.nickname || 'Not specified'}\n` +
                                `**Payment Method:** ${orderData.paymentMethod || 'Not specified'}\n` +
                                `**Delivery Method:** ${orderData.deliveryMethod || 'Not specified'}\n` +
                                `**Coordinates:** ${orderData.coordinates || 'Not specified'}\n` +
                                `**Dimension:** ${orderData.dimension || 'Not specified'}`,
                            inline: false
                        },
                        { 
                            name: '📦 Items', 
                            value: itemsList || 'No items',
                            inline: false
                        },
                        { name: '💰 Amount', value: `${total} RUB`, inline: true },
                        { name: '👤 Buyer', value: `<@${buyerId}>`, inline: true },
                        { name: '🔒 Closed by', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setColor(0xFF0000)
                    .setTimestamp()
                    .setFooter({ text: `Order ID: ${interaction.channelId}`, iconURL: client.user.displayAvatarURL() });

                await logNotification(guildId, logEmbed);

                const finalEmbed = new EmbedBuilder()
                    .setTitle('Completed Order')
                    .setColor(0xFF0000)
                    .setTimestamp()
                    .setFooter({ text: `Closed by: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

                finalEmbed.addFields({
                    name: 'Buyer',
                    value: `<@${buyerId}> #${buyerId} /${buyerName}`,
                    inline: false
                });

                let finalItemsList = '';
                for (const item of items) {
                    const product = getProduct(guildId, item.name);
                    const color = product?.color || '#5865F2';
                    finalItemsList += `- ${item.name} - x${item.count}\n`;
                }

                if (finalItemsList) {
                    finalEmbed.addFields({
                        name: 'Items',
                        value: finalItemsList || 'No items',
                        inline: false
                    });
                }

                finalEmbed.addFields({
                    name: 'Total Amount',
                    value: `${total} RUB`,
                    inline: false
                });

                if (orderData.paymentMethod) {
                    finalEmbed.addFields({
                        name: 'Payment Method',
                        value: orderData.paymentMethod,
                        inline: true
                    });
                }

                if (orderData.deliveryMethod) {
                    finalEmbed.addFields({
                        name: 'Delivery Method',
                        value: orderData.deliveryMethod,
                        inline: true
                    });
                }

                if (orderData.coordinates) {
                    finalEmbed.addFields({
                        name: 'Coordinates',
                        value: orderData.coordinates,
                        inline: false
                    });
                }

                if (orderData.dimension) {
                    finalEmbed.addFields({
                        name: 'Dimension',
                        value: orderData.dimension,
                        inline: false
                    });
                }

                try {
                    await interaction.channel.send({ embeds: [finalEmbed] });
                    await interaction.channel.delete(`Ticket closed by: ${interaction.user.tag}`);
                } catch (e) {
                    console.log('⚠️ Could not delete channel:', e.message);
                }
                
                db.prepare('DELETE FROM orders WHERE guild_id = ? AND channel_id = ?').run(guildId, interaction.channelId);

                try {
                    await interaction.update({ content: 'Ticket closed.', embeds: [], components: [] });
                } catch (e) {
                    console.log('⚠️ Could not update message:', e.message);
                }
            } else {
                try {
                    await interaction.update({ content: 'Close cancelled.', embeds: [], components: [] });
                } catch (e) {}
            }
            return;
        }

        if (interaction.customId === 'customize_welcome') {
            if (!isAdmin(interaction.member, guildId)) {
                try {
                    await interaction.reply({ content: 'You don\'t have permission!', flags: 64 });
                } catch (e) {}
                return;
            }
            try {
                await interaction.showModal(createWelcomeCustomizeModal());
            } catch (e) {
                console.log('⚠️ Could not show modal:', e.message);
            }
            return;
        }

        if (interaction.customId === 'customize_leave') {
            if (!isAdmin(interaction.member, guildId)) {
                try {
                    await interaction.reply({ content: 'You don\'t have permission!', flags: 64 });
                } catch (e) {}
                return;
            }
            try {
                await interaction.showModal(createLeaveCustomizeModal());
            } catch (e) {
                console.log('⚠️ Could not show modal:', e.message);
            }
            return;
        }

        try {
            await interaction.reply({
                content: '❌ Unknown button!',
                flags: 64
            });
        } catch (e) {}

    } catch (error) {
        console.error('Error in handleButtonClick:', error);
        try {
            await interaction.reply({
                content: `❌ An error occurred: ${error.message}`,
                flags: 64
            });
        } catch (e) {
            console.error('Could not send error message:', e);
        }
    }
}

// ========== GUILD MEMBER EVENTS ==========

client.on('guildMemberAdd', async (member) => {
    try {
        const guildId = member.guild.id;
        const settings = getGuildSettings(guildId);
        
        if (settings?.allowed_roles) {
            const allowedRoles = JSON.parse(settings.allowed_roles || '[]');
            
            if (allowedRoles.length > 0) {
                const roleId = allowedRoles[0];
                const role = member.guild.roles.cache.get(roleId);
                if (role) {
                    await member.roles.add(role);
                    console.log(`✅ Assigned role ${role.name} to ${member.user.tag} (from addrole)`);
                } else {
                    console.log(`⚠️ Role with ID ${roleId} not found on ${member.guild.name}`);
                }
            }
        }

        const welcomeSettings = db.prepare('SELECT * FROM welcome_settings WHERE guild_id = ?').get(guildId);

        if (!settings?.welcome_channel_id) return;
        if (welcomeSettings && welcomeSettings.enabled === 0) return;

        const channel = client.channels.cache.get(settings.welcome_channel_id);
        if (!channel?.isTextBased()) return;

        const totalMembers = member.guild.memberCount;

        const embed = new EmbedBuilder()
            .setTitle(welcomeSettings?.welcome_title || 'Добро пожаловать!')
            .setDescription(
                (welcomeSettings?.welcome_description || 'Привет, {user}!\nТы {count}-й участник сервера!')
                    .replace(/{user}/g, `${member}`)
                    .replace(/{count}/g, totalMembers)
            )
            .setColor(welcomeSettings?.welcome_color || '#800080');

        if (settings.welcome_image_url) {
            embed.setImage(settings.welcome_image_url);
        }

        try {
            await channel.send({ embeds: [embed] });
            console.log(`Welcome for ${member.user.tag}`);
        } catch (e) {
            console.error('Error welcome embed:', e);
        }
    } catch (error) {
        console.error(`❌ Error in guildMemberAdd for ${member.user.tag}:`, error);
    }
});

client.on('guildMemberRemove', async (member) => {
    try {
        const guildId = member.guild.id;
        const settings = getGuildSettings(guildId);
        if (!settings) return;
        
        const welcomeSettings = db.prepare('SELECT * FROM welcome_settings WHERE guild_id = ?').get(guildId);
        if (!settings.welcome_channel_id) return;
        if (welcomeSettings && welcomeSettings.enabled === 0) return;

        const channel = client.channels.cache.get(settings.welcome_channel_id);
        if (!channel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setTitle(welcomeSettings?.leave_title || 'До свидания!')
            .setDescription(
                (welcomeSettings?.leave_description || 'Прощай, {user}.')
                    .replace(/{user}/g, member.user.username)
            )
            .setColor(welcomeSettings?.leave_color || '#800080');

        if (settings.leave_image_url) {
            embed.setImage(settings.leave_image_url);
        }

        await channel.send({ embeds: [embed] });
        console.log(`Leave for ${member.user.tag}`);
    } catch (e) {
        console.error('Error leave embed:', e);
    }
});

// ========== BOT LAUNCH ==========

client.login(BOT_TOKEN)
    .then(() => console.log('Bot is online!'))
    .catch(err => {
        console.error('Login error:', err);
        process.exit(1);
    });
