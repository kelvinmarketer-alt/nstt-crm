/**
 * TELEGRAM WEBHOOK — Cloudflare Workers example
 * ─────────────────────────────────────────────
 * Deploy lên Cloudflare Workers (free tier 100k req/ngày, đủ cho 10 shipper).
 *
 * Setup:
 *   1. Tạo bot mới qua @BotFather → lấy BOT_TOKEN
 *   2. Set env BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY (nếu dùng Supabase)
 *   3. Deploy: wrangler deploy
 *   4. Set webhook:
 *      curl -F "url=https://your-worker.workers.dev" \
 *        "https://api.telegram.org/bot$BOT_TOKEN/setWebhook"
 *
 * Mapping shipper:
 *   - Trong DRIVERS, mỗi shipper có field telegramChatId
 *   - Lệnh chỉ chấp nhận từ chatId trong whitelist
 */

const BOT_TOKEN = "REPLACE_WITH_BOT_TOKEN";
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

/* Map chatId → shipper info */
const SHIPPER_MAP = {
  /* '5242450169': { id:'DR01', name:'Bùi Văn C' }, */
};

async function reply(chatId, text) {
  await fetch(`${TG}/sendMessage`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: chatId, text, parse_mode:'Markdown' })
  });
}

async function handleCommand(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const shipper = SHIPPER_MAP[chatId];

  if (!shipper) {
    await reply(chatId, "❌ Số ĐT này chưa được đăng ký shipper. Liên hệ Tuấn Tú để thêm vào hệ thống.");
    return;
  }

  if (text === '/start' || text === '/help') {
    await reply(chatId, `👋 *Chào ${shipper.name}!*\n\nCác lệnh:\n• \`/donhom\` — xem đơn cần giao\n• \`/lay NSTT-000142\` — đã lấy hàng\n• \`/giao NSTT-000142\` — đã giao xong\n• \`/hoan NSTT-000142 lý do\` — hoãn\n• \`/pod NSTT-000142\` + ảnh — gửi ảnh POD`);
    return;
  }

  const [verb, ...rest] = text.slice(1).split(' ');
  const orderCode = rest[0];

  /* TODO: gọi API NSTT để cập nhật STORE.orders[].status */
  /* VD dùng Supabase REST:
     await fetch(`${SUPABASE_URL}/rest/v1/orders?code=eq.${orderCode}`, {
       method:'PATCH',
       headers:{ apikey:SUPABASE_KEY, 'Content-Type':'application/json' },
       body: JSON.stringify({ status:'delivered' })
     });
  */

  switch (verb) {
    case 'giao':
      await reply(chatId, `✅ Đã ghi nhận giao xong ${orderCode}.\nCảm ơn ${shipper.name}!`);
      break;
    case 'lay':
      await reply(chatId, `🚚 ${orderCode} đang trên đường giao.`);
      break;
    case 'hoan':
      await reply(chatId, `📝 Đã ghi nhận hoãn ${orderCode}: "${rest.slice(1).join(' ')}"`);
      break;
    case 'pod':
      if (msg.photo) {
        /* TODO: tải ảnh về, upload Supabase Storage, lưu URL vào order.podPhoto */
        await reply(chatId, `📷 Đã lưu ảnh POD cho ${orderCode}`);
      } else {
        await reply(chatId, "Vui lòng gửi kèm ảnh");
      }
      break;
    case 'donhom':
      /* TODO: query orders theo shipper.id, status in (confirmed, pickup, transit) */
      await reply(chatId, "📋 *Đơn cần giao hôm nay:*\n• NSTT-000142 · Nhà hàng Á Đông · 6h30\n• NSTT-000143 · Bếp Daewoo · 5h00\n• NSTT-000145 · Phở Thìn · 4h30");
      break;
    default:
      await reply(chatId, `❓ Lệnh "/${verb}" không hỗ trợ. Gõ /help xem danh sách.`);
  }
}

export default {
  async fetch(req) {
    if (req.method !== 'POST') return new Response('OK');
    const body = await req.json();
    if (body.message) await handleCommand(body.message);
    return new Response('OK');
  }
};
