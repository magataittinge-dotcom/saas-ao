export default function PlanetBackground() {
  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        right: '-200px',
        top: '-100px',
        width: '800px',
        height: '800px',
        opacity: 0.6,
      }}
    >
      {/* Planet body */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 35%, rgba(228,233,242,0.30), rgba(30,58,138,0.20) 50%, transparent 70%)',
          boxShadow: '0 0 120px 60px rgba(228,233,242,0.15), inset 0 0 80px 20px rgba(228,233,242,0.08)',
          animation: 'planet-rotate 60s linear infinite',
        }}
      >
        {/* Conic bands overlay */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(
              from 0deg,
              transparent 0deg,
              rgba(228,233,242,0.06) 30deg,
              transparent 60deg,
              rgba(0,212,170,0.04) 120deg,
              transparent 150deg,
              rgba(228,233,242,0.05) 200deg,
              transparent 240deg,
              rgba(6,182,212,0.04) 300deg,
              transparent 360deg
            )`,
            animation: 'planet-rotate 90s linear infinite reverse',
          }}
        />
        {/* Atmospheric glow at the edge */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle at 65% 40%, rgba(0,212,170,0.12) 0%, transparent 40%)',
          }}
        />
        {/* Horizontal band lines */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{ opacity: 0.4 }}
        >
          {[20, 35, 50, 65, 80].map((top) => (
            <div
              key={top}
              className="absolute left-0 right-0"
              style={{
                top: `${top}%`,
                height: '1px',
                background: `linear-gradient(90deg, transparent 10%, rgba(228,233,242,0.15) 30%, rgba(0,212,170,0.10) 50%, rgba(228,233,242,0.15) 70%, transparent 90%)`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Ring */}
      <div
        className="absolute rounded-full"
        style={{
          inset: '-30px',
          border: '1px solid rgba(228,233,242,0.10)',
          animation: 'planet-rotate 80s linear infinite reverse',
        }}
      />
      {/* Second ring */}
      <div
        className="absolute rounded-full"
        style={{
          inset: '-60px',
          border: '1px solid rgba(228,233,242,0.05)',
          animation: 'planet-rotate 120s linear infinite',
        }}
      />

      {/* Small orbiting dot */}
      <div
        className="absolute"
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: '#E9EDF5',
          boxShadow: '0 0 12px rgba(228,233,242,0.6)',
          top: '-30px',
          left: '50%',
          transformOrigin: '0 430px',
          animation: 'planet-rotate 20s linear infinite',
        }}
      />
    </div>
  )
}
