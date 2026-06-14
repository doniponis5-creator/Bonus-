"""PDF builder для договоров рассрочки — Смарт Центр (fpdf2 + DejaVu).
АУДИТ: 2026-06-06 — юридик текст тузатилди, дизайн яхшиланди.
"""
import logging
import os
from pathlib import Path
from datetime import datetime
from decimal import Decimal

logger = logging.getLogger("sbonus.contracts.pdf")
PDF_STORAGE = Path(os.getenv("CONTRACTS_PDF_DIR", "/app/contracts_pdf"))
PDF_STORAGE.mkdir(parents=True, exist_ok=True)

# Бренд Смарт Центр
PRIMARY = (32, 201, 151)
PRIMARY_D = (22, 160, 120)
DARK = (28, 28, 30)
MUTED = (110, 110, 115)
BORDER = (220, 220, 226)
BG_SOFT = (240, 248, 245)
BG_TABLE = (228, 250, 240)
BG_PAID = (235, 255, 240)
BG_STAMP = (235, 250, 244)


def _fmt_money(n):
    if n is None: return "0,00"
    try: return f"{float(n):,.2f}".replace(",", " ").replace(".", ",")
    except: return str(n)


def _fmt_date(val):
    if val is None: return "—"
    if hasattr(val, "strftime"): return val.strftime("%d.%m.%Y")
    try: return datetime.fromisoformat(str(val)[:10]).strftime("%d.%m.%Y")
    except: return str(val)


def _fmt_datetime(val):
    if val is None: return "—"
    if hasattr(val, "strftime"): return val.strftime("%d.%m.%Y %H:%M")
    try: return datetime.fromisoformat(str(val).replace("Z","")).strftime("%d.%m.%Y %H:%M")
    except: return str(val)


def _plural(n, forms):
    n = abs(int(n))
    m100, m10 = n % 100, n % 10
    if 11 <= m100 <= 14: return forms[2]
    if m10 == 1: return forms[0]
    if 2 <= m10 <= 4: return forms[1]
    return forms[2]


def _parse_iso_date(v):
    if v is None: return None
    if hasattr(v, "year"): return v
    try:
        return datetime.fromisoformat(str(v)[:10]).date()
    except Exception:
        return None


def _format_term(count, schedule):
    if not count: return "—"
    p_pay = _plural(count, ['платёж', 'платежа', 'платежей'])
    if count <= 1 or not schedule:
        return f"{count} {p_pay}"
    f = _parse_iso_date(schedule[0].get("date"))
    l = _parse_iso_date(schedule[-1].get("date"))
    if not f or not l:
        return f"{count} {p_pay}"
    days = max(0, (l - f).days)
    months = max(1, round(days / 30))
    p_mo = _plural(months, ['месяц', 'месяца', 'месяцев'])
    p_dn = _plural(days, ['день', 'дня', 'дней'])
    return f"{count} {p_pay} · {months} {p_mo} ({days} {p_dn})"


def _get(obj, *keys, default=""):
    for k in keys:
        try:
            if hasattr(obj, k):
                v = getattr(obj, k)
                if v not in (None, ""): return v
            if isinstance(obj, dict) and k in obj and obj[k] not in (None, ""):
                return obj[k]
        except: continue
    return default


def _load_fonts(pdf):
    FONT = "Helvetica"
    FONT_B = "Helvetica"
    for fp in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
    ]:
        if Path(fp).exists():
            try:
                pdf.add_font("DejaVu", "", fp)
                FONT = "DejaVu"
                bp = fp.replace("Sans.ttf", "Sans-Bold.ttf")
                if Path(bp).exists():
                    pdf.add_font("DejaVuB", "", bp)
                    FONT_B = "DejaVuB"
                else:
                    FONT_B = "DejaVu"
                break
            except Exception as e:
                logger.warning(f"font fail {fp}: {e}")
    return FONT, FONT_B


LOGO_PATHS = [
    "/app/contracts_pdf/smart_logo.png",
    "/app/app/contracts/smart_logo.png",
    "/root/sbonus_contracts/smart_logo.png",
]


def _draw_logo(pdf, x, y, FONT_B, size=14):
    # Расм лого бўлса — шуни ишлатамиз
    for lp in LOGO_PATHS:
        if Path(lp).exists():
            try:
                pdf.image(lp, x=x, y=y, w=size, h=size)
                return
            except Exception as e:
                logger.warning(f"logo image fail: {e}")
    # Fallback — чизилган лого
    pdf.set_fill_color(*PRIMARY)
    pdf.ellipse(x, y, size, size, style="F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(x, y + size * 0.17)
    try: pdf.set_font(FONT_B, "", int(size * 0.7))
    except: pdf.set_font("Helvetica", "B", int(size * 0.7))
    pdf.cell(size, size * 0.6, "S", align="C")
    pdf.set_text_color(*DARK)


# ── Доимий реквизитлар (Смарт Центр) ──
SELLER_DEFAULTS = {
    "fio": "Усманов Комолиддин Акмарижинович",
    "inn": "21209200000252",
    "address": "Ош обл. Араван Р-ну ул. Ош-3000 86",
    "account": "",
    "trade_name": "Магазин Смарт Центр",
}


def _seller(c, field, default_key):
    """Продавец маълумоти — 1С дан олади, бўш бўлса доимийдан."""
    val = _get(c, f"seller_{field}", default="")
    if not val or val == "—" or val.strip() == "":
        return SELLER_DEFAULTS.get(default_key, "")
    return val


def _build_pdf(contract) -> bytes:
    from fpdf import FPDF
    c = contract
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    FONT, FONT_B = _load_fonts(pdf)

    def sf(bold=False, size=10):
        try: pdf.set_font(FONT_B if bold else FONT, "", size)
        except: pdf.set_font("Helvetica", "B" if bold else "", size)

    pdf.add_page()
    W = pdf.w - pdf.l_margin - pdf.r_margin

    # ── ШАПКА ──
    sf(bold=True, size=14); pdf.set_text_color(*PRIMARY_D)
    pdf.cell(W, 6, "СМАРТ ЦЕНТР", align="C", ln=1)
    pdf.set_text_color(*DARK); pdf.ln(1)
    pdf.set_draw_color(*PRIMARY); pdf.set_line_width(0.4)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.set_line_width(0.2); pdf.ln(4)

    # ── ЗАГОЛОВОК ──
    rtu_num = _get(c, "rtu_number", default="—")
    sf(bold=True, size=14)
    pdf.multi_cell(W, 7, "ДОГОВОР РАССРОЧКИ", align="C")
    sf(bold=True, size=11); pdf.set_text_color(*PRIMARY_D)
    pdf.multi_cell(W, 6, f"№ {rtu_num}", align="C")
    pdf.set_text_color(*DARK); pdf.ln(2)

    sf(size=9); pdf.set_text_color(*MUTED)
    city = _get(c, "city", default="с.Араван")
    rtu_date = _get(c, "rtu_date")
    pdf.cell(W/2, 5, city, ln=0)
    pdf.cell(W/2, 5, _fmt_date(rtu_date), align="R", ln=1)
    pdf.set_text_color(*DARK); pdf.ln(3)

    # ── СТОРОНЫ ──
    sf(size=10)
    seller = _seller(c, "fio", "fio")
    seller_inn_v = _seller(c, "inn", "inn")
    seller_addr = _seller(c, "address", "address")
    seller_acc_v = _seller(c, "account", "account")

    client = _get(c, "client_fio", default="—")
    passport = _get(c, "client_passport_serial", default="")
    pdate = _fmt_date(_get(c, "client_passport_date")) if _get(c, "client_passport_date") else ""
    piss = _get(c, "client_passport_issuer", default="")
    cinn = _get(c, "client_inn", default="")
    extra = ""
    if passport:
        extra += f", паспорт {passport}"
        if pdate and pdate != "—": extra += f" от {pdate}"
        if piss: extra += f", выдан {piss}"
    if cinn: extra += f", ИНН {cinn}"
    seller_basis = "свидетельства о государственной регистрации"
    if seller_inn_v:
        seller_basis += f" (ИНН {seller_inn_v})"

    pdf.multi_cell(W, 5,
        f"{seller}, именуемый(-ая) в дальнейшем «Продавец», действующий(-ая) "
        f"на основании {seller_basis}, с одной стороны, и "
        f"{client}{extra}, именуемый(-ая) в дальнейшем «Покупатель», "
        f"с другой стороны, совместно именуемые «Стороны», "
        f"заключили настоящий Договор о нижеследующем:", align="J")
    pdf.ln(2)

    def section(t):
        pdf.ln(1.5)
        sf(bold=True, size=9); pdf.set_text_color(*PRIMARY_D)
        pdf.cell(W, 5, t, ln=1); pdf.set_text_color(*DARK); sf(size=9)

    def para(t):
        sf(size=9)
        pdf.multi_cell(W, 4.2, t, align="J")
        pdf.ln(0.4)

    total = float(_get(c, "total_amount", default=0) or 0)
    total_words = _get(c, "total_amount_words", default="")
    term = int(_get(c, "term_months", default=0) or 0)
    initial = float(_get(c, "initial_payment", default=0) or 0)

    section("1. ПРЕДМЕТ ДОГОВОРА")
    para("1.1. Продавец обязуется передать Покупателю товар(ы), указанный(-ые) "
         "в Приложении №1, в количестве и ассортименте согласно Приложению №1 "
         "к настоящему Договору (далее — «Товар»), а Покупатель обязуется "
         "принять и оплатить Товар на условиях рассрочки платежа.")
    para("1.2. Товар передаётся Покупателю в момент подписания настоящего "
         "Договора на условиях рассрочки в порядке, предусмотренном статьёй 3.")

    section("2. ПРАВА И ОБЯЗАННОСТИ СТОРОН")
    para("2.1. Продавец обязуется:")
    para(f"2.1.1. В день подписания настоящего Договора передать Покупателю Товар "
         f"по акту приёма-передачи. Место передачи: торговая точка Продавца "
         f"по адресу: {seller_addr}.")
    para("2.1.2. Передать Товар надлежащего качества, в количестве и ассортименте, "
         "соответствующем Приложению №1.")
    para("2.1.3. Одновременно с передачей Товара передать Покупателю "
         "гарантийные обязательства и необходимую документацию на Товар.")
    para("2.2. Покупатель обязуется:")
    para("2.2.1. Принять Товар по акту приёма-передачи и оплатить его "
         "в порядке и сроки, установленные статьёй 3 настоящего Договора.")
    para("2.2.2. Бережно относиться к Товару до момента полной оплаты. "
         "Не передавать, не продавать и не сдавать в залог Товар до полного "
         "расчёта с Продавцом без его письменного согласия.")

    section("3. ЦЕНА И ПОРЯДОК ОПЛАТЫ")
    para(f"3.1. Общая стоимость Товара составляет {_fmt_money(total)} сом "
         f"({total_words}).")
    if initial > 0:
        para(f"3.2. Первоначальный взнос составляет {_fmt_money(initial)} сом "
             f"и вносится Покупателем в день подписания настоящего Договора.")
    _sched_for_term = _get(c, "schedule_json", "schedule", default=[]) or []
    financed = total - initial
    para(f"3.3. Оставшаяся сумма в размере {_fmt_money(financed)} сом выплачивается "
         f"Покупателем в рассрочку согласно Графику погашения (Приложение №2).")
    para(f"3.4. Срок рассрочки: {_format_term(len(_sched_for_term) or term, _sched_for_term)}.")
    para("3.5. Оплата производится путём внесения наличных денежных средств в кассу "
         "Продавца или путём перечисления на расчётный счёт (Элсом) Продавца, "
         "указанный в настоящем Договоре.")
    para("3.6. Покупатель вправе досрочно погасить всю оставшуюся сумму "
         "без дополнительных комиссий и штрафов.")

    section("4. ПРАВО СОБСТВЕННОСТИ И ЗАЛОГ")
    para("4.1. Товар передаётся Покупателю в пользование с момента подписания "
         "акта приёма-передачи.")
    para("4.2. Право собственности на Товар переходит к Покупателю после полной "
         "оплаты его стоимости. До полной оплаты Товар остаётся в залоге у "
         "Продавца (статья 429 Гражданского кодекса Кыргызской Республики).")
    para("4.3. В случае полной оплаты Стороны подтверждают переход права "
         "собственности без оформления дополнительных документов.")

    section("5. ОТВЕТСТВЕННОСТЬ СТОРОН")
    para("5.1. В случае просрочки очередного платежа Покупатель уплачивает "
         "Продавцу неустойку (пеню) в размере 0,1% (ноль целых одна десятая "
         "процента) от суммы просроченного платежа за каждый день просрочки, "
         "но не более 10% от суммы просроченного платежа.")
    para("5.2. В случае просрочки платежа свыше 30 (тридцати) календарных дней "
         "Продавец вправе потребовать досрочного возврата всей оставшейся "
         "суммы задолженности.")
    para("5.3. В случае просрочки свыше 60 (шестидесяти) календарных дней "
         "Продавец вправе в одностороннем порядке расторгнуть настоящий "
         "Договор с возвратом Товара. При этом ранее внесённые платежи "
         "возвращаются Покупателю за вычетом неустойки и стоимости износа Товара.")
    para("5.4. Продавец несёт ответственность за качество Товара в соответствии "
         "с Законом Кыргызской Республики «О защите прав потребителей».")

    section("6. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ")
    para("6.1. Стороны освобождаются от ответственности за неисполнение "
         "обязательств по настоящему Договору, если оно вызвано обстоятельствами "
         "непреодолимой силы (форс-мажор): стихийные бедствия, военные действия, "
         "эпидемии, акты государственных органов, непосредственно препятствующие "
         "исполнению Договора.")
    para("6.2. Сторона, для которой наступили указанные обстоятельства, "
         "обязана уведомить другую Сторону в течение 5 (пяти) рабочих дней "
         "с момента их наступления.")
    para("6.3. Если обстоятельства непреодолимой силы продолжаются более "
         "3 (трёх) месяцев, каждая из Сторон вправе расторгнуть настоящий "
         "Договор, уведомив другую Сторону в письменной форме.")

    # Поручитель — добавляем раздел только если есть
    guarantor_fio = _get(c, "guarantor_fio", default="")
    has_guarantor = bool(guarantor_fio)
    next_section_num = 7

    if has_guarantor:
        g_phone = _get(c, "guarantor_phone", default="")
        g_pass = _get(c, "guarantor_passport", default="")
        g_inn = _get(c, "guarantor_inn", default="")
        g_addr = _get(c, "guarantor_address", default="")

        section(f"{next_section_num}. ПОРУЧИТЕЛЬСТВО")
        para(f"{next_section_num}.1. За исполнение обязательств Покупателя по настоящему "
             f"Договору поручается: {guarantor_fio}"
             + (f", паспорт {g_pass}" if g_pass else "")
             + (f", ИНН {g_inn}" if g_inn else "")
             + (f", адрес: {g_addr}" if g_addr else "")
             + (f", тел.: {g_phone}" if g_phone else "")
             + " (далее — «Поручитель»).")
        para(f"{next_section_num}.2. Поручитель несёт солидарную ответственность "
             f"с Покупателем за исполнение обязательств по настоящему Договору, "
             f"включая уплату основного долга, неустойки и возмещение убытков.")
        para(f"{next_section_num}.3. Поручительство действует до полного исполнения "
             f"Покупателем обязательств по настоящему Договору.")
        next_section_num += 1

    section(f"{next_section_num}. ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ")
    para(f"{next_section_num}.1. В случае замены Товара Продавцом по гарантии "
         f"(полностью или частично) до полной оплаты, Стороны обязаны внести "
         f"соответствующие изменения в Приложение №1 в течение 3 (трёх) рабочих "
         f"дней с момента замены.")
    next_section_num += 1

    section(f"{next_section_num}. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ")
    para(f"{next_section_num}.1. Настоящий Договор вступает в силу с момента "
         f"его подписания обеими Сторонами и действует до полного исполнения "
         f"Сторонами своих обязательств.")
    para(f"{next_section_num}.2. Все споры, возникающие из настоящего Договора, "
         f"разрешаются путём переговоров. При недостижении согласия спор передаётся "
         f"на рассмотрение суда по месту нахождения Продавца в соответствии "
         f"с законодательством Кыргызской Республики.")
    para(f"{next_section_num}.3. Любые изменения и дополнения к настоящему Договору "
         f"действительны при условии, что они совершены в письменной форме "
         f"и подписаны Сторонами.")
    para(f"{next_section_num}.4. Все приложения к настоящему Договору являются "
         f"его неотъемлемой частью.")
    para(f"{next_section_num}.5. Во всём, что не предусмотрено настоящим Договором, "
         f"Стороны руководствуются действующим законодательством "
         f"Кыргызской Республики.")
    # Количество экземпляров — динамическое
    num_copies = 3 if has_guarantor else 2
    copies_word = _plural(num_copies, ["экземпляре", "экземплярах", "экземплярах"])
    para(f"{next_section_num}.6. Настоящий Договор составлен в {num_copies} ({['двух','трёх'][num_copies-2]}) "
         f"{copies_word}, имеющих одинаковую юридическую силу, по одному для "
         f"каждой из Сторон" + (" и Поручителя" if has_guarantor else "") + ".")

    # ── ШТАМП ЭЛЕКТРОННОЙ ПОДПИСИ ──
    signed_at = getattr(c, "signed_at", None)
    sig_ip = getattr(c, "signature_ip", "") or ""
    if signed_at:
        pdf.ln(6)
        pdf.set_fill_color(*BG_STAMP); pdf.set_draw_color(*PRIMARY)
        yb = pdf.get_y()
        pdf.rect(pdf.l_margin, yb, W, 14, style="DF")
        pdf.set_xy(pdf.l_margin+4, yb+2)
        sf(bold=True, size=9); pdf.set_text_color(*PRIMARY_D)
        pdf.cell(W-8, 4, "ЭЛЕКТРОННАЯ ПОДПИСЬ ПОДТВЕРЖДЕНА", ln=1)
        pdf.set_xy(pdf.l_margin+4, yb+6.5)
        sf(size=8); pdf.set_text_color(*MUTED)
        info = f"Подписано: {_fmt_datetime(signed_at)}"
        if sig_ip:
            info += f"  •  IP: {sig_ip}"
        info += "  •  OTP подтверждён через WhatsApp"
        pdf.cell(W-8, 4, info, ln=1)
        pdf.set_text_color(*DARK)

    # ═══ СТРАНИЦА 2: АКТ ПРИЁМКИ-ПЕРЕДАЧИ + ПРИЛОЖЕНИЕ №1 ═══
    pdf.add_page()
    sf(bold=True, size=13); pdf.set_text_color(*DARK)
    pdf.cell(W, 7, "Акт приёмки-передачи товара", align="C", ln=1)
    pdf.ln(2)
    sf(size=10); pdf.set_text_color(*DARK)
    pdf.cell(W/2, 5, city, ln=0)
    pdf.cell(W/2, 5, _fmt_date(rtu_date), align="R", ln=1)
    pdf.ln(1)
    sf(bold=True, size=10)
    pdf.cell(W, 5, "Приложение №1", align="R", ln=1)
    pdf.ln(2)

    # Реквизиты
    sf(size=10)
    col_label = 55
    col_value = W - col_label
    def kv(label, value):
        y = pdf.get_y()
        sf(bold=True, size=10)
        pdf.set_xy(pdf.l_margin, y)
        pdf.cell(col_label, 6, label, ln=0)
        sf(size=10)
        pdf.set_xy(pdf.l_margin + col_label, y)
        pdf.multi_cell(col_value, 6, str(value) if value else "—")

    kv("Продавец:", seller)
    kv("Покупатель:", client)
    kv("Адрес торговой точки:", seller_addr)
    kv("Телефон покупателя:", _get(c, "client_phone", default="—"))
    pdf.ln(4)

    # Таблица товаров
    items = _get(c, "items_json", "items", default=[]) or []
    if items:
        cw = [12, W-12-22-32-36, 22, 32, 36]
        hdrs = ["№", "Наименование товара", "Кол-во", "Цена", "Сумма"]
        sf(bold=True, size=10)
        pdf.set_draw_color(*DARK); pdf.set_line_width(0.3)
        pdf.set_fill_color(245, 245, 245); pdf.set_text_color(*DARK)
        for i, h in enumerate(hdrs):
            align = "R" if i >= 2 else ("C" if i == 0 else "L")
            pdf.cell(cw[i], 9, h, border=1, align=align, fill=True)
        pdf.ln()
        sf(size=10)
        total_sum = Decimal(0)
        total_qty = Decimal(0)
        for idx, item in enumerate(items):
            nm = str(_get(item, "name", default="—"))[:70]
            qty = _get(item, "qty", default=0)
            price = _get(item, "price", default=0)
            sv = _get(item, "sum", default=0)
            total_sum += Decimal(str(sv or 0))
            try: total_qty += Decimal(str(qty or 0))
            except: pass
            pdf.cell(cw[0], 8, str(idx+1), border=1, align="C")
            pdf.cell(cw[1], 8, nm, border=1)
            pdf.cell(cw[2], 8, str(qty), border=1, align="R")
            pdf.cell(cw[3], 8, _fmt_money(price), border=1, align="R")
            pdf.cell(cw[4], 8, _fmt_money(sv), border=1, align="R")
            pdf.ln()
        sf(bold=True, size=10)
        pdf.set_fill_color(245, 245, 245)
        pdf.cell(cw[0]+cw[1], 9, "Итого:", border=1, align="R", fill=True)
        pdf.cell(cw[2], 9, str(total_qty), border=1, align="R", fill=True)
        pdf.cell(cw[3], 9, "", border=1, fill=True)
        pdf.cell(cw[4], 9, _fmt_money(total_sum), border=1, align="R", fill=True)
        pdf.ln(10)

        sf(size=10); pdf.set_text_color(*DARK)
        pdf.multi_cell(W, 5,
            f"Я, {client}, подтверждаю получение вышеуказанного Товара "
            f"в полном объёме. Претензий к качеству, количеству и комплектности "
            f"Товара не имею.")
        pdf.ln(4)

        sf(bold=True, size=10)
        words = f" ({total_words})" if total_words else ""
        pdf.multi_cell(W, 5, f"Общая сумма: {_fmt_money(total_sum)}{words} сом")
        pdf.ln(8)
    else:
        sf(size=10); pdf.set_text_color(220, 100, 100)
        pdf.cell(W, 8, "Список товаров пуст", align="C", ln=1)
        pdf.set_text_color(*DARK)
        pdf.ln(8)

    # ── РЕКВИЗИТЫ СТОРОН (без линий подписи — онлайн договор) ──
    half = W/2 - 4
    x_left = pdf.l_margin
    x_right = pdf.l_margin + W/2 + 4

    pdf.ln(2)
    pdf.set_draw_color(*BORDER); pdf.set_line_width(0.3)
    yb_top = pdf.get_y()
    # Рамка вокруг реквизитов
    box_h = 0  # вычислим после

    # ── Левая колонка: Продавец ──
    pdf.set_xy(x_left + 2, yb_top + 2)
    sf(bold=True, size=10); pdf.set_text_color(*PRIMARY_D)
    pdf.cell(half - 4, 5, "ПРОДАВЕЦ", ln=1)
    pdf.set_xy(x_left + 2, pdf.get_y()); sf(size=9); pdf.set_text_color(*DARK)
    sl_lines = [seller]
    seller_acc_v = _get(c, "seller_account", default="")
    if seller_addr and seller_addr != "—": sl_lines.append(seller_addr)
    if seller_inn_v: sl_lines.append(f"ИНН: {seller_inn_v}")
    if seller_acc_v: sl_lines.append(f"Элсом: {seller_acc_v}")
    pdf.multi_cell(half - 4, 5, "\n".join(sl_lines))
    y_left_end = pdf.get_y()

    # ── Правая колонка: Покупатель ──
    pdf.set_xy(x_right + 2, yb_top + 2)
    sf(bold=True, size=10); pdf.set_text_color(*PRIMARY_D)
    pdf.cell(half - 4, 5, "ПОКУПАТЕЛЬ", ln=1)
    pdf.set_xy(x_right + 2, pdf.get_y()); sf(size=9); pdf.set_text_color(*DARK)
    cl_addr = _get(c, "client_address", default="")
    cl_phone = _get(c, "client_phone", default="—")
    cl_lines = [client]
    if cl_addr and cl_addr != "—": cl_lines.append(f"Адрес: {cl_addr}")
    cl_lines.append(f"Тел: {cl_phone}")
    if passport:
        pp = f"Паспорт: {passport}"
        if pdate and pdate != "—": pp += f" от {pdate}"
        if piss: pp += f", {piss}"
        cl_lines.append(pp)
    if cinn: cl_lines.append(f"ИНН: {cinn}")
    pdf.multi_cell(half - 4, 5, "\n".join(cl_lines))
    y_right_end = pdf.get_y()

    # Рамки
    box_h = max(y_left_end, y_right_end) - yb_top + 4
    pdf.set_draw_color(*BORDER)
    pdf.rect(x_left, yb_top, half, box_h, style="D")
    pdf.rect(x_right, yb_top, half, box_h, style="D")
    pdf.set_y(yb_top + box_h + 2)

    # Поручитель — реквизиты (если есть)
    if has_guarantor:
        pdf.ln(2)
        yg_top = pdf.get_y()
        pdf.set_xy(x_left + 2, yg_top + 2)
        sf(bold=True, size=10); pdf.set_text_color(*PRIMARY_D)
        pdf.cell(W - 4, 5, "ПОРУЧИТЕЛЬ", ln=1)
        pdf.set_xy(x_left + 2, pdf.get_y()); sf(size=9); pdf.set_text_color(*DARK)
        g_lines = [guarantor_fio]
        g_phone = _get(c, "guarantor_phone", default="")
        g_pass = _get(c, "guarantor_passport", default="")
        g_inn = _get(c, "guarantor_inn", default="")
        g_addr = _get(c, "guarantor_address", default="")
        if g_addr: g_lines.append(f"Адрес: {g_addr}")
        if g_phone: g_lines.append(f"Тел: {g_phone}")
        if g_pass: g_lines.append(f"Паспорт: {g_pass}")
        if g_inn: g_lines.append(f"ИНН: {g_inn}")
        pdf.multi_cell(W - 4, 5, "\n".join(g_lines))
        yg_end = pdf.get_y()
        pdf.rect(x_left, yg_top, W, yg_end - yg_top + 4, style="D")
        pdf.set_y(yg_end + 6)

    # ── ЭЛЕКТРОННАЯ ПОДПИСЬ (вместо линий подписи) ──
    signed_at_act = getattr(c, "signed_at", None)
    sig_ip_act = getattr(c, "signature_ip", "") or ""
    pdf.ln(4)
    pdf.set_fill_color(*BG_STAMP); pdf.set_draw_color(*PRIMARY)
    yb = pdf.get_y()
    stamp_h = 20 if signed_at_act else 12
    pdf.rect(pdf.l_margin, yb, W, stamp_h, style="DF")

    if signed_at_act:
        # Подписан
        pdf.set_xy(pdf.l_margin + 4, yb + 2)
        sf(bold=True, size=10); pdf.set_text_color(*PRIMARY_D)
        pdf.cell(W - 8, 5, "ПОДПИСАНО ЭЛЕКТРОННОЙ ПОДПИСЬЮ", ln=1)
        pdf.set_xy(pdf.l_margin + 4, yb + 7.5)
        sf(size=8); pdf.set_text_color(*MUTED)
        info1 = f"Покупатель: {client}  •  Дата: {_fmt_datetime(signed_at_act)}"
        pdf.cell(W - 8, 4, info1, ln=1)
        pdf.set_xy(pdf.l_margin + 4, yb + 12)
        info2 = f"Подтверждение: OTP-код через WhatsApp ({cl_phone})"
        if sig_ip_act:
            info2 += f"  •  IP: {sig_ip_act}"
        pdf.cell(W - 8, 4, info2, ln=1)
    else:
        # Ожидает подписания
        pdf.set_xy(pdf.l_margin + 4, yb + 2)
        sf(bold=True, size=10); pdf.set_text_color(200, 160, 0)
        pdf.cell(W - 8, 4, "ОЖИДАЕТ ЭЛЕКТРОННОЙ ПОДПИСИ", ln=1)
        pdf.set_xy(pdf.l_margin + 4, yb + 7)
        sf(size=8); pdf.set_text_color(*MUTED)
        pdf.cell(W - 8, 4, "Покупатель подтвердит договор через WhatsApp (OTP-код)", ln=1)

    pdf.set_text_color(*DARK)

    # ═══ СТРАНИЦА 3: ГРАФИК ПОГАШЕНИЯ (Приложение №2) ═══
    pdf.add_page()
    sf(bold=True, size=14); pdf.set_text_color(*DARK)
    pdf.cell(W, 7, "График погашения рассрочки", align="C", ln=1)
    sf(bold=True, size=11)
    pdf.multi_cell(W, 6,
        f"к Договору рассрочки №{rtu_num}", align="C")
    sf(size=10)
    schedule = _get(c, "schedule_json", "schedule", default=[]) or []
    first_d = _fmt_date(schedule[0].get("date")) if schedule else _fmt_date(rtu_date)
    last_d = _fmt_date(schedule[-1].get("date")) if schedule else "—"
    pdf.cell(W, 6, f"от  {first_d} г.", align="C", ln=1)
    pdf.ln(2)
    sf(bold=True, size=11)
    pdf.cell(W, 6, f"Дата полного погашения:  {last_d} г.", ln=1)
    pdf.ln(2)
    sf(bold=True, size=10)
    pdf.cell(W, 5, "Приложение №2", align="R", ln=1)
    pdf.ln(2)

    financed = total - initial
    term_label = _plural(term or len(schedule), ['месяц', 'месяца', 'месяцев'])
    sf(bold=True, size=11)
    pdf.cell(W, 6, f"Сумма рассрочки: {_fmt_money(financed)} сом    "
                   f"Срок: {term or len(schedule)} {term_label}", ln=1)
    pdf.cell(W, 6, f"Покупатель: {client}", ln=1)
    pdf.ln(4)

    if schedule:
        sw = [14, 40, 52, 60]
        sh = ["№", "Дата платежа", "Сумма к оплате", "Остаток после погашения"]
        sf(bold=True, size=10)
        pdf.set_draw_color(*DARK); pdf.set_line_width(0.3)
        pdf.set_fill_color(245, 245, 245); pdf.set_text_color(*DARK)
        for i, h in enumerate(sh):
            pdf.cell(sw[i], 14, h, border=1, align="C", fill=True)
        pdf.ln()
        sf(size=10)
        for idx, row in enumerate(schedule):
            nv = str(_get(row, "n", default=idx+1))
            dt = _fmt_date(_get(row, "date"))
            amt = _get(row, "amount", default=0)
            bal = _get(row, "balance", default=0)
            balf = float(bal or 0)
            bal_str = _fmt_money(bal) if balf > 0 else "—"
            pdf.cell(sw[0], 9, nv, border=1, align="C")
            pdf.cell(sw[1], 9, dt, border=1, align="L")
            pdf.cell(sw[2], 9, _fmt_money(amt), border=1, align="R")
            pdf.cell(sw[3], 9, bal_str, border=1, align="R")
            pdf.ln()
    else:
        sf(size=10); pdf.set_text_color(220, 100, 100)
        pdf.cell(W, 8, "График не сформирован", align="C", ln=1)
        pdf.set_text_color(*DARK)

    # Подписи на странице графика — электронный формат
    pdf.ln(8)
    sf(size=9); pdf.set_text_color(*MUTED)
    pdf.cell(W, 5, "Договор подписан в электронной форме с подтверждением через OTP-код (WhatsApp).", align="C", ln=1)
    pdf.set_text_color(*DARK)

    return bytes(pdf.output())


def build_schedule_pdf(contract) -> bytes:
    """Печатная форма «График погашения рассрочки» (одна страница)."""
    from fpdf import FPDF
    c = contract
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    FONT, FONT_B = _load_fonts(pdf)

    def sf(bold=False, size=11):
        try: pdf.set_font(FONT_B if bold else FONT, "", size)
        except: pdf.set_font("Helvetica", "B" if bold else "", size)

    pdf.add_page()
    W = pdf.w - pdf.l_margin - pdf.r_margin

    rtu_num = _get(c, "rtu_number", default="—")
    rtu_date = _get(c, "rtu_date", default=None)
    client_fio = _get(c, "client_fio", default="—")
    total = float(_get(c, "total_amount", default=0) or 0)
    initial = float(_get(c, "initial_payment", default=0) or 0)
    financed = total - initial
    schedule = _get(c, "schedule_json", "schedule", default=[]) or []
    term_val = int(_get(c, "term_months", default=0) or 0)

    first_date = _fmt_date(schedule[0].get("date")) if schedule else _fmt_date(rtu_date)
    last_date = _fmt_date(schedule[-1].get("date")) if schedule else "—"

    sf(bold=True, size=14)
    pdf.cell(W, 8, "График погашения рассрочки", align="C", ln=1)
    sf(bold=True, size=11)
    pdf.multi_cell(W, 6,
        f"к Договору рассрочки №{rtu_num}", align="C")
    sf(size=10)
    pdf.cell(W, 6, f"от  {first_date} г.", align="C", ln=1)
    pdf.ln(2)
    sf(bold=True, size=11)
    pdf.cell(W, 6, f"Дата полного погашения:  {last_date} г.", ln=1)
    pdf.ln(4)

    term_label = _plural(term_val or len(schedule), ['месяц', 'месяца', 'месяцев'])
    sf(bold=True, size=11)
    pdf.cell(W, 6, f"Сумма рассрочки: {_fmt_money(financed)} сом    "
                   f"Срок: {term_val or len(schedule)} {term_label}", ln=1)
    pdf.cell(W, 6, f"Покупатель: {client_fio}", ln=1)
    pdf.ln(6)

    cw = [14, 38, 50, 60]
    headers = ["№", "Дата платежа", "Сумма к оплате", "Остаток после погашения"]
    sf(bold=True, size=10)
    pdf.set_draw_color(*DARK); pdf.set_line_width(0.3)
    pdf.set_fill_color(245, 245, 245); pdf.set_text_color(*DARK)
    for i, h in enumerate(headers):
        pdf.cell(cw[i], 14, h, border=1, align="C", fill=True)
    pdf.ln()

    sf(size=10)
    for idx, row in enumerate(schedule):
        nv = str(_get(row, "n", default=idx+1))
        dt = _fmt_date(_get(row, "date"))
        amt = _get(row, "amount", default=0)
        bal = _get(row, "balance", default=0)
        balf = float(bal or 0)
        bal_str = _fmt_money(bal) if balf > 0 else "—"
        pdf.cell(cw[0], 9, nv, border=1, align="C")
        pdf.cell(cw[1], 9, dt, border=1, align="L")
        pdf.cell(cw[2], 9, _fmt_money(amt), border=1, align="R")
        pdf.cell(cw[3], 9, bal_str, border=1, align="R")
        pdf.ln()

    return bytes(pdf.output())


def ensure_unsigned_pdf(contract) -> str:
    path = PDF_STORAGE / f"{contract.id}_unsigned.pdf"
    try:
        data = _build_pdf(contract)
        path.write_bytes(data)
        contract.pdf_unsigned_path = str(path)
        logger.info(f"PDF: {path} ({len(data)} bytes)")
    except Exception as e:
        logger.exception(f"PDF err: {e}")
        path.write_bytes(b"%PDF-1.4\n%%EOF")
    return str(path)


def regenerate_signed_pdf(contract, signature_b64: str = None) -> str:
    path = PDF_STORAGE / f"{contract.id}_signed.pdf"
    try:
        if signature_b64: contract.signature_b64 = signature_b64
        data = _build_pdf(contract)
        path.write_bytes(data)
        contract.pdf_signed_path = str(path)
        logger.info(f"Signed PDF: {path} ({len(data)} bytes)")
    except Exception as e:
        logger.exception(f"Signed PDF err: {e}")
        u = PDF_STORAGE / f"{contract.id}_unsigned.pdf"
        if u.exists(): path.write_bytes(u.read_bytes())
    return str(path)
