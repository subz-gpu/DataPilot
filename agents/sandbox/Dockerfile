FROM python:3.11-slim

# Libraries the generated analysis code may use.
RUN pip install --no-cache-dir \
    pandas numpy matplotlib seaborn scipy scikit-learn statsmodels openpyxl pyarrow

RUN mkdir -p /work/outputs /data && chmod 755 /work /data
WORKDIR /work
