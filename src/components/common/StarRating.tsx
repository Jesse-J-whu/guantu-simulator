/** 星级评分展示(权力/繁忙/晋升/风险)。 */

interface StarRatingProps {
  label: string;
  value: number;
}

export function StarRating({ label, value }: StarRatingProps) {
  const stars = Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={`star ${i < value ? 'filled' : 'empty'}`}>
      ★
    </span>
  ));
  return (
    <div className="rating-item">
      <span className="rating-label">{label}</span>
      <div className="rating-stars">{stars}</div>
    </div>
  );
}
