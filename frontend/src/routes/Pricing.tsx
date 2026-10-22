import GrilleOffres from '@/components/offres/GrilleOffres'

export default function Pricing() {
  return (
    <div className="min-h-screen py-16 px-6 relative" style={{ background: '#1C222D' }}>
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-extrabold mb-4" style={{ color: '#F4F6FA', fontFamily: 'Geist Sans, system-ui, sans-serif' }}>
            Tarifs simples et transparents
          </h1>
          <p className="text-lg" style={{ color: '#9BA4B5' }}>
            Trois offres, les mêmes fonctions : seuls les quotas mensuels changent.
          </p>
        </div>

        <GrilleOffres />

        <p className="text-center text-sm mt-10" style={{ color: '#788295' }}>
          Sans engagement · Résiliable à tout moment · Support inclus
        </p>
      </div>
    </div>
  )
}
