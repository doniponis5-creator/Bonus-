import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Удаление аккаунта — S Bonus · Смарт Центр',
  description: 'Как удалить аккаунт и персональные данные в бонусной программе Смарт Центр (S Bonus).',
};

export default function DeleteAccountPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '32px 20px 80px',
        color: 'var(--text)',
        lineHeight: 1.65,
        fontSize: 15,
      }}
    >
      <Link href="/" style={{ color: 'var(--accent)', fontSize: 14, textDecoration: 'none' }}>
        ← На главную
      </Link>

      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '20px 0 6px' }}>
        Удаление аккаунта
      </h1>
      <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 24 }}>
        Приложение «S Bonus» — бонусная программа магазина «Смарт Центр».
      </p>

      <Section title="Способ 1 — в приложении (рекомендуется)">
        <ol style={olStyle}>
          <li>Войдите в приложение S Bonus.</li>
          <li>Откройте вкладку <b>«Профиль»</b>.</li>
          <li>Нажмите <b>«Удалить аккаунт»</b>.</li>
          <li>Подтвердите удаление. Аккаунт будет удалён немедленно.</li>
        </ol>
      </Section>

      <Section title="Способ 2 — по запросу">
        <p>
          Если у вас нет доступа к приложению, отправьте запрос на удаление с указанием
          вашего номера телефона:
        </p>
        <ul style={ulStyle}>
          <li>Электронная почта: <b>doniponis5@gmail.com</b></li>
          <li>WhatsApp / телефон: <b>0557 100 505</b>, <b>0505 000 100</b></li>
        </ul>
        <p>Запрос обрабатывается в течение 7 рабочих дней.</p>
      </Section>

      <Section title="Какие данные удаляются">
        <ul style={ulStyle}>
          <li>Имя (ФИО)</li>
          <li>Номер телефона</li>
          <li>Дата рождения</li>
          <li>QR-код и реферальный код</li>
          <li>Доступ к аккаунту (бонусный баланс аннулируется)</li>
        </ul>
      </Section>

      <Section title="Какие данные сохраняются и на какой срок">
        <p>
          Обезличенная история покупок и бонусных операций (без привязки к вашей личности)
          может сохраняться в учётных и бухгалтерских целях в соответствии с требованиями
          законодательства Кыргызской Республики. Эти данные не позволяют идентифицировать вас.
        </p>
      </Section>

      <Section title="Контакты">
        <p>
          По вопросам удаления данных: doniponis5@gmail.com, тел. 0557 100 505.
          См. также <Link href="/privacy" style={{ color: 'var(--accent)' }}>Политику конфиденциальности</Link>.
        </p>
      </Section>
    </main>
  );
}

const ulStyle: React.CSSProperties = { paddingLeft: 20, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 };
const olStyle: React.CSSProperties = { paddingLeft: 20, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', color: '#fff' }}>{title}</h2>
      <div style={{ color: 'var(--text-2)' }}>{children}</div>
    </section>
  );
}
