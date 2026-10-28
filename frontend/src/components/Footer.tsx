export function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid rgba(0,212,255,0.08)',
        padding: '24px',
        marginTop: 60,
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 12, color: '#3d5a7a', fontFamily: 'JetBrains Mono, monospace' }}>
          WindIQ · Data: Elexon BMRS (WINDFOR + FUELHH) · January 2026
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: 'GitHub', href: 'https://github.com' },
            { label: 'Elexon API', href: 'https://bmrs.elexon.co.uk' },
            { label: 'README', href: '#' },
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: '#3d5a7a',
                textDecoration: 'none',
                transition: 'color 0.2s',
                fontFamily: 'JetBrains Mono, monospace',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#00d4ff')}
              onMouseLeave={e => (e.currentTarget.style.color = '#3d5a7a')}
            >
              {link.label}
            </a>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#1a3050', fontFamily: 'JetBrains Mono, monospace' }}>
          Built with FastAPI · React · Recharts · Elexon BMRS
        </div>
      </div>
    </footer>
  )
}
