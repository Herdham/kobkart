import { Heart, ShieldCheck, Users, Zap } from 'lucide-react'

const items = [
  { icon: ShieldCheck, title: 'Secure & Safe', text: 'Your data and payments are protected.' },
  { icon: Users, title: 'Trusted Community', text: 'Real people, real transactions.' },
  { icon: Zap, title: 'Easy to Use', text: 'Simple and smooth experience.' },
  { icon: Heart, title: 'Built for You', text: 'Designed for your goals and dreams.' },
]

export default function FeatureStrip() {
  return (
    <section className="features">
      {items.map(({ icon: Icon, title, text }) => (
        <div className="feature" key={title}>
          <span className="feature-icon"><Icon size={18} /></span>
          <strong>{title}</strong>
          <p>{text}</p>
        </div>
      ))}
    </section>
  )
}
