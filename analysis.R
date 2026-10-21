# Shared by webR and local R validation. No changes to source observations.
trend_result <- function(d) {
 d <- d[is.finite(d$value), ]; n <- nrow(d)
 if(n < 6) return(list(error="Se requieren al menos 6 años válidos."))
 if(length(unique(d$value))<2) return(list(n=n,tau=0,slope=0,p=NA,lower=0,upper=0,lag1=NA,note="Serie constante; prueba de significancia no definida."))
 sen <- function(x,y) { p<-combn(seq_along(x),2); median((y[p[2,]]-y[p[1,]])/(x[p[2,]]-x[p[1,]])) }
 slope<-sen(d$year,d$value); fit<-median(d$value-slope*d$year)+slope*d$year
 test<-suppressWarnings(cor.test(d$year,d$value,method="kendall",exact=FALSE))
 residual<-d$value-fit; lag1<-if(sd(residual)>0) cor(head(residual,-1),tail(residual,-1)) else NA_real_
 # Moving-block residual bootstrap, fixed seed, contiguous series only.
 ci<-c(NA_real_,NA_real_)
 if(n>=10 && all(diff(d$year)==1)) {
  set.seed(20261004); block<-max(2L,round(n^(1/3)))
  slopes<-replicate(499,{starts<-sample(seq_len(n-block+1),ceiling(n/block),replace=TRUE); idx<-unlist(lapply(starts,function(s)s:(s+block-1)))[seq_len(n)]; sen(d$year,fit+residual[idx])})
  ci<-as.numeric(quantile(slopes,c(.025,.975)))
 }
 list(n=n,tau=unname(test$estimate),p=test$p.value,slope=slope,lower=ci[1],upper=ci[2],lag1=lag1,
 note="p de Kendall sin corrección por dependencia temporal: evidencia exploratoria. IC de Sen: bootstrap residual por bloques, 499 réplicas cuando hay al menos 10 años consecutivos.")
}
forecast_result <- function(d,h) {
 d<-d[is.finite(d$value),]; n<-nrow(d)
 if(n<10 || any(diff(d$year)!=1)) return(list(error="Pronóstico no calculado: se requieren al menos 10 años consecutivos completos."))
 if(!requireNamespace("forecast",quietly=TRUE)) return(list(error="Paquete forecast no disponible."))
 scale<-max(1,mean(abs(d$value))); y<-d$value/scale; initial<-max(8L,floor(n*.6)); origins<-seq.int(initial,n-1L)
 predict_model<-function(train,model,h) {
  x<-ts(train,frequency=1)
  switch(model,Ingenuo=forecast::naive(x,h=h,level=c(80,95)),
   ETS=forecast::forecast(forecast::ets(x),h=h,level=c(80,95)),
   ARIMA=forecast::forecast(forecast::auto.arima(x,seasonal=FALSE,stepwise=TRUE,approximation=FALSE),h=h,level=c(80,95)))
 }
 models<-c("Ingenuo","ETS","ARIMA")
 fits<-lapply(models,function(m) {
  errors<-vapply(origins,function(i) tryCatch(y[i+1]-as.numeric(predict_model(y[1:i],m,1)$mean[1]),error=function(e) NA_real_),numeric(1))
  data.frame(model=m,RMSE=if(all(is.finite(errors)))sqrt(mean(errors^2))*scale else NA_real_,MAE=if(all(is.finite(errors)))mean(abs(errors))*scale else NA_real_,origins=sum(is.finite(errors)))
 })
 accuracy<-do.call(rbind,fits); valid<-accuracy[is.finite(accuracy$RMSE),]; if(!nrow(valid)) return(list(error="Ningún modelo completó la validación."))
 valid<-valid[order(valid$RMSE),]; winner<-valid$model[1]; pred<-predict_model(y,winner,h)
 projected<-data.frame(year=max(d$year)+seq_len(h),mean=as.numeric(pred$mean)*scale,lower=as.numeric(pred$lower[,"95%"])*scale,upper=as.numeric(pred$upper[,"95%"])*scale)
 list(winner=winner,accuracy=accuracy,projection=projected,trainingYears=n,validationOrigins=length(origins),
 note="Validación a un paso; no valida directamente el horizonte completo. Intervalos predictivos del 95%, condicionados al modelo. Los límites negativos se conservan y requieren interpretación; no se ocultan mediante truncamiento.")
}
comparison_result <- function(d,method,period=FALSE) {
 d<-d[is.finite(d$value),]; d$group<-factor(d$group); k<-nlevels(d$group)
 if(k<2 || k>40) return(list(error="Seleccione entre 2 y 40 grupos."))
 if(!period) {
  counts<-table(d$year,d$group); common<-as.numeric(rownames(counts)[apply(counts,1,function(x)all(x==1))])
  d<-d[d$year %in% common,]; d$group<-droplevels(d$group)
  if(length(common)<4) return(list(error="Se requieren al menos 4 años comunes con datos completos en todos los grupos."))
 }
 if(period) {
  if(any(table(d$group)<4)) return(list(error="Cada periodo requiere al menos 4 años."))
  test<-kruskal.test(value~group,data=d); pw<-pairwise.wilcox.test(d$value,d$group,p.adjust.method="BH",exact=FALSE)
  matrix<-pw$p.value; ij<-which(is.finite(matrix),arr.ind=TRUE)
  pairs<-data.frame(comparison=paste(rownames(matrix)[ij[,1]],colnames(matrix)[ij[,2]],sep=" / "),p_adjusted=matrix[ij])
  return(list(method="Kruskal–Wallis por periodo",p=test$p.value,n=nrow(d),pairs=pairs,note="Contraste exploratorio: los años de cada periodo pueden presentar dependencia temporal. No representa un experimento ni evidencia causal."))
 }
 if(method=="anova") {
  fit<-aov(value~group+factor(year),data=d); tab<-summary(fit)[[1]]; tk<-TukeyHSD(fit,"group")$group
  pairs<-data.frame(comparison=rownames(tk),difference=tk[,"diff"],lower=tk[,"lwr"],upper=tk[,"upr"],p_adjusted=tk[,"p adj"],row.names=NULL)
  residual<-residuals(fit); sw<-if(length(residual)>=3&&length(residual)<=5000&&sd(residual)>0)shapiro.test(residual)$p.value else NA
  return(list(method="ANOVA con año como bloque fijo y Tukey HSD",p=tab["group","Pr(>F)"],n=nrow(d),years=sort(unique(d$year)),effect=tab["group","Sum Sq"]/sum(tab[,"Sum Sq"]),effectName="Eta cuadrado (grupo / SS total)",normalityP=sw,pairs=pairs,note="Exploratorio: requiere errores independientes, homocedasticidad y residuos aproximadamente normales. El bloqueo por año no elimina toda dependencia serial. No use diferencias significativas como criterio automático de exclusión."))
 }
 if(k==2) {
  wide<-reshape(d,idvar="year",timevar="group",direction="wide"); a<-wide[[2]]; b<-wide[[3]]
  test<-suppressWarnings(wilcox.test(a,b,paired=TRUE,exact=FALSE))
  return(list(method="Wilcoxon pareado por año",p=test$p.value,n=nrow(d),years=sort(unique(d$year)),effect=median(a-b),effectName=paste("Mediana de diferencias:",levels(d$group)[1],"-",levels(d$group)[2]),pairs=data.frame(comparison=paste(levels(d$group),collapse=" / "),p_adjusted=test$p.value),note="Los pares corresponden a años comunes. La dependencia entre años limita la inferencia."))
 }
 test<-friedman.test(value~group|year,data=d); groups<-levels(d$group); comb<-combn(groups,2)
 pairs<-do.call(rbind,lapply(seq_len(ncol(comb)),function(j){a<-d[d$group==comb[1,j],];b<-d[d$group==comb[2,j],];b<-b[match(a$year,b$year),];p<-suppressWarnings(wilcox.test(a$value,b$value,paired=TRUE,exact=FALSE)$p.value);data.frame(comparison=paste(comb[,j],collapse=" / "),difference=median(a$value-b$value),p=p)}))
 pairs$p_adjusted<-p.adjust(pairs$p,method="BH");pairs$p<-NULL
 list(method="Friedman con bloques anuales; Wilcoxon pareado posterior, ajuste BH",p=test$p.value,n=nrow(d),years=sort(unique(d$year)),effect=unname(test$statistic)/(length(unique(d$year))*(k-1)),effectName="W de Kendall",pairs=pairs,note="Solo años comunes. Pruebas exploratorias sujetas a dependencia temporal; BH controla la tasa de falsos descubrimientos de los contrastes posteriores.")
}
run_analysis <- function(input) {
 if(input$type=="report") {
  return(lapply(input$metrics,function(m) run_analysis(list(type="science",data=m$data,baseline=m$baseline,horizon=input$horizon,hasExclusions=input$hasExclusions))))
 }
 if(input$type=="science") {
  d<-as.data.frame(input$data); base<-as.data.frame(input$baseline)
  list(trend=trend_result(d),baselineTrend=trend_result(base),forecast=forecast_result(d,input$horizon),baselineForecast=if(isTRUE(input$hasExclusions))forecast_result(base,input$horizon) else NULL,engine=R.version.string,forecastVersion=as.character(utils::packageVersion("forecast")))
 } else comparison_result(as.data.frame(input$data),input$method,isTRUE(input$period))
}
