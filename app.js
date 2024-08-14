const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qr = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox'],
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('Un cliente se ha conectado');
});

client.on('qr', (qrCode) => {
    console.log('Nuevo código QR recibido');
    qr.toDataURL(qrCode, (err, url) => {
        if (err) {
            console.error('Error al generar el código QR:', err);
            return;
        }
        io.emit('qr', url);
        console.log('Código QR enviado al cliente');
    });
});

client.on('ready', () => {
    console.log('Cliente de WhatsApp está listo!');
    io.emit('ready', 'WhatsApp está conectado!');
});

const areas = {
    'servicio al cliente': 'atención en este chat',
    'soporte': '+573209501615',
    'cartera': '+573012932329',
    'dirección': '+573103773928'
};

const conversations = {};

function normalizeText(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchArea(input) {
    const normalizedInput = normalizeText(input);
    for (const [key, value] of Object.entries(areas)) {
        if (normalizedInput.includes(normalizeText(key))) {
            return key;
        }
    }
    return null;
}

async function sendMessage(to, message) {
    await client.sendMessage(to, message);
}

async function handleConversation(msg) {
    const from = msg.from;

    if (!conversations[from]) {
        conversations[from] = { step: 'inicio' };
    }

    const conversation = conversations[from];

    switch (conversation.step) {
        case 'inicio':
            if (normalizeText(msg.body).includes('hola')) {
                await sendMessage(from, `Hola! Bienvenido a nuestro servicio de atención.
Por favor, elige el área con la que deseas comunicarte:
• Servicio al cliente
• Soporte
• Cartera
• Dirección`);
                conversation.step = 'seleccion_area';
            } else {
                await sendMessage(from, 'Por favor, inicia la conversación con un "Hola".');
            }
            break;

        case 'seleccion_area':
            const matchedArea = matchArea(msg.body);
            if (matchedArea) {
                if (matchedArea === 'servicio al cliente') {
                    await sendMessage(from, 'Un agente de servicio al cliente te atenderá en breve.');
                    conversation.step = 'inicio';
                } else {
                    await sendMessage(from, 'Por favor, proporciona tu nombre.');
                    conversation.selectedArea = matchedArea;
                    conversation.step = 'nombre';
                }
            } else {
                await sendMessage(from, 'Lo siento, no entendí tu selección. Por favor, elige una de las opciones proporcionadas.');
            }
            break;

        case 'nombre':
            conversation.nombre = msg.body;
            const redirectNumber = areas[conversation.selectedArea];
            const areaName = conversation.selectedArea.charAt(0).toUpperCase() + conversation.selectedArea.slice(1);
            const link = `https://wa.me/${redirectNumber.replace('+', '')}?text=Hola,+soy+${conversation.nombre}.+Me+ comunico+con+el+área+de+${areaName}.`;
            await sendMessage(from, `Gracias, ${conversation.nombre}. Te estamos redirigiendo al área de ${conversation.selectedArea}. Por favor, haz clic en este enlace: ${link}`);
            conversation.step = 'inicio';
            break;

        default:
            await sendMessage(from, 'Lo siento, ha ocurrido un error. Por favor, inicia la conversación con un "Hola".');
            conversation.step = 'inicio';
    }
}

client.on('message', async (msg) => {
    try {
        await handleConversation(msg);
    } catch (error) {
        console.error('Error al manejar el mensaje:', error);
        await sendMessage(msg.from, 'Lo siento, ha ocurrido un error. Por favor, intenta de nuevo más tarde.');
    }
});

client.initialize();

const port = 3000;
server.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
