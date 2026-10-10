import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import './dashboard.css'

const SHOW_DRAFT_NOTICE = true // set to false after a lawyer has reviewed these pages
const UPDATED = '9 October 2026'
const CONTACT = '[support email to be added]'

const DOCS = {
  terms: {
    title: 'Terms & Conditions',
    sections: [
      { h: '1. About Kobkart', p: [
        'Kobkart is an online platform where sellers create packages and customers join them to pay for goods in small instalments. We provide the tools. We are not the seller of the goods, we are not a bank, and we do not lend money.',
        "Payments are processed by Paystack. When you pay, Paystack splits the payment: Kobkart's service fee comes to us and the rest goes to the seller's bank account.",
      ] },
      { h: '2. Your account', p: [
        'You must be at least 18 and give correct information. You must verify your email, keep your password private, and you are responsible for everything done with your account. One person should have one account. We may suspend accounts that give false information.',
      ] },
      { h: '3. Save & Collect packages', p: [
        'You choose an item and the price is locked when you join, so it does not change later. You pay the instalment shown on the schedule until the item is fully paid. After that, the seller delivers the item to you. Delivery arrangements are between you and the seller.',
      ] },
      { h: '4. Group Rotation packages', p: [
        'A fixed group pays the same amount every round. In each round, one member collects the whole pot as goods from the seller. The seller sets the order and the start date, and they are locked once the group starts.',
        'When you join a group you promise to keep paying every round until the group ends, including after you have collected. Kobkart gives the seller tools to track payments but does not guarantee that every member will pay. Joining a group is a risk that you and the seller accept together.',
      ] },
      { h: '5. Payments and fees', p: [
        'All amounts are in naira. Customers pay the amount shown and no extra Kobkart fee is added to it. Our service fee is taken from the seller\'s side of each payment. Card details are handled by Paystack, not by Kobkart.',
      ] },
      { h: '6. Late or missed payments', p: [
        "If you miss a payment, you are shown as Late. After a short grace period you may be shown as Defaulted. A Defaulted person may be blocked from joining new packages until they catch up, and the seller can contact you about it.",
      ] },
      { h: '7. Refunds and disputes', p: [
        "Kobkart does not hold your money, so refunds are handled by the seller under their policy and the law. If a seller does not deliver or does not respond, contact us and we will try to help. We cannot promise that you will get a refund. [Refund policy to be confirmed after legal review.]",
      ] },
      { h: '8. What you must not do', p: [
        'Do not use Kobkart for fraud, fake sellers or customers, illegal or counterfeit goods, harassment, or to avoid paying what you agreed to pay. Do not misuse referral codes.',
      ] },
      { h: '9. Suspension and ending your account', p: [
        'We may suspend or remove accounts or packages that break these terms or put other users at risk. You may stop using Kobkart at any time, but payments you have already agreed to remain due.',
      ] },
      { h: '10. Our responsibility', p: [
        'We work to keep Kobkart running and safe, but we cannot promise it will always be available or error-free. We are not responsible for goods supplied by sellers or for losses caused by other users. Nothing in these terms removes rights you have under Nigerian law.',
      ] },
      { h: '11. Changes', p: [
        'We may update these terms. If the change is important we will tell you in the app or by email. Using Kobkart after a change means you accept it.',
      ] },
      { h: '12. Law and contact', p: [
        'These terms are governed by the laws of the Federal Republic of Nigeria. Contact: ' + CONTACT + '.',
      ] },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    sections: [
      { h: '1. Who we are', p: [
        'Kobkart ("we") runs this platform. [Registered business name and address to be added after CAC registration.] Contact: ' + CONTACT + '.',
      ] },
      { h: '2. What we collect', p: [
        'Your name, email address, phone number and a password (stored only in scrambled form). If you are a seller: your business name, the bank name and account name you add for payouts, and the last four digits of that account number. We also keep records of the packages you join or create, your payments (amount, date, reference and status), and your referral code.',
        'Photos you upload for packages and products are stored so they can be shown to customers.',
      ] },
      { h: '3. What we do not store', p: [
        'We never see or store your card number. Cards are handled by Paystack. Full bank account numbers are sent to Paystack to set up payouts and are not kept by Kobkart.',
      ] },
      { h: '4. Why we use your information', p: [
        'To run your account, process payments, show sellers who has joined and who is late, send verification codes and reminders, prevent fraud, and meet legal duties.',
      ] },
      { h: '5. Who can see your information', p: [
        'Sellers see the name, phone number and payment status of customers in their own packages. Members of a group can see each other\'s names and positions, but not phone numbers. Our service providers, such as Paystack, our email provider and our hosting provider, handle data for us. We share information with authorities only when the law requires it.',
      ] },
      { h: '6. Keeping it safe', p: [
        'We use secure connections, scrambled passwords and limited access. No system is perfectly safe, so please use a strong password and keep it private.',
      ] },
      { h: '7. How long we keep it', p: [
        'We keep your information while your account is active and for as long as the law requires us to keep financial records.',
      ] },
      { h: '8. Your rights', p: [
        'Under the Nigeria Data Protection Act 2023 you can ask to see, correct or delete your information, and you can object to some uses or withdraw your consent. Contact us at ' + CONTACT + '. Some records cannot be deleted while a payment plan is open or while the law requires us to keep them.',
      ] },
      { h: '9. Children', p: ['Kobkart is for people aged 18 and over.'] },
      { h: '10. Changes', p: ['We may update this policy and will tell you about important changes in the app or by email.'] },
    ],
  },

  seller: {
    title: 'Seller Agreement',
    sections: [
      { h: '1. Approval', p: [
        'Sellers must be approved by Kobkart before creating packages. What you tell us about yourself and your business must be true. We may remove your approval if we find a problem.',
      ] },
      { h: '2. What you promise', p: [
        'You will deliver what you list, at the price you list, and as you describe it. You will not change a price that has been locked for a customer, add hidden charges, or sell illegal or counterfeit goods. You will answer customers promptly, keep your own records, and follow the laws that apply to your business, including tax.',
      ] },
      { h: '3. Save & Collect packages', p: [
        'Each customer pays for their chosen item on the schedule you set. When the customer has paid in full, you must deliver the item and then mark it as delivered.',
      ] },
      { h: '4. Group Rotation packages', p: [
        'You decide who you accept into your group and the order of collection. You must start a group only when you are ready to fulfil it. Once started, the order is locked. On each round you must give the member whose turn it is goods worth the full pot, and mark the round as collected only when that really happened.',
        'Members who stop paying after they have collected are a risk that you carry. Kobkart gives you tools to see who is late, but we do not guarantee that members will pay.',
      ] },
      { h: '5. Payouts and fees', p: [
        'Customer payments go through Paystack to the bank account you saved. Check that the account name shown is yours before you save it. Kobkart is not responsible for payouts to an account you entered incorrectly.',
        "Kobkart's service fee is a percentage of each payment (currently 3%) and Paystack's processing charges are also taken from your side. You can see each payment in your Payments page.",
      ] },
      { h: '6. Refunds and disputes', p: [
        'If you cannot deliver, you must refund the customer promptly for anything not delivered. If you ignore a customer, we may suspend your account, share payment records with the customer, and share them with the authorities when the law requires it.',
      ] },
      { h: '7. Customer information', p: [
        'You may use your customers\' names and phone numbers only to run the package, such as reminders and delivery. Do not sell, share or spam with this information, and keep it safe.',
      ] },
      { h: '8. Suspension', p: [
        'We may hide or remove a package, or suspend your account, if customers are at risk or if you break this agreement.',
      ] },
      { h: '9. Responsibility', p: [
        'You are responsible for the goods you sell and for what you promise customers. You agree to cover Kobkart for claims caused by your goods or your failure to deliver.',
      ] },
      { h: '10. Law and contact', p: [
        'This agreement is governed by the laws of the Federal Republic of Nigeria. Contact: ' + CONTACT + '.',
      ] },
    ],
  },
}

export default function Legal({ doc }) {
  const d = DOCS[doc]
  const others = [
    ['terms', '/terms', 'Terms & Conditions'],
    ['privacy', '/privacy', 'Privacy Policy'],
    ['seller', '/seller-agreement', 'Seller Agreement'],
  ].filter(([k]) => k !== doc)

  return (
    <div className="jn">
      <header className="jn-top">
        <Logo />
        <div className="jn-links"><Link to="/" className="plain">Home</Link></div>
      </header>
      <main className="jn-wrap">
        <article className="db-card legal">
          {SHOW_DRAFT_NOTICE && (
            <div className="warn-card">
              Draft template. These pages are a starting point and have not been reviewed by a lawyer yet.
            </div>
          )}
          <h1>{d.title}</h1>
          <p className="muted small">Last updated: {UPDATED}</p>
          {d.sections.map((s) => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.p.map((t, i) => <p key={i}>{t}</p>)}
            </section>
          ))}
          <div className="legal-nav">
            {others.map(([k, to, label]) => <Link key={k} to={to} className="link-strong">{label}</Link>)}
          </div>
        </article>
      </main>
    </div>
  )
}